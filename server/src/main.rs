use futures_util::{SinkExt, StreamExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite::{handshake::server::Request, Message};
use clap::Parser;
use std::sync::{Arc, Mutex};
use http;

mod board;
mod names;
mod encoding;
use encoding::{ClientToServerPacket, ServerToClientPacket, encode_entry};
mod player_list;
use player_list::PlayerList;

const MIN_DELAY_TILL_NEW_BOARD: std::time::Duration = std::time::Duration::from_millis(500);

#[derive(Debug)]
enum BoardEvent {
    RevealSquare((u16, u16)),
    ChordSquare((u16, u16)),
    ToggleFlagSquare((u16, u16)),
    NewConnection(mpsc::UnboundedSender<ServerToClientPacket>),
    NewBoard,
    NextBoardConfig { width: u16, height: u16, num_mines: u32 },
}

fn unwrap_header_value(header_value: Arc<Mutex<Option<http::header::HeaderValue>>>) -> Option<String> {
    Some(header_value.lock().ok()?.clone()?.to_str().ok()?.to_string())
}

async fn accept_connection(
    stream: TcpStream,
    event_tx: mpsc::UnboundedSender<(BoardEvent, std::net::SocketAddr)>,
) {
    // let addr: Arc<str> = stream.peer_addr().expect("should have address").to_string().as_str().into();
    let addr_guard = Arc::new(Mutex::new(None));
    let port_guard = Arc::new(Mutex::new(None));
    let ws_stream = tokio_tungstenite::accept_hdr_async(stream, |request: &Request, response| {
        let mut addr = addr_guard.lock().unwrap();
        *addr = request.headers().get("X-Real-IP").map(|e| e.clone());
        let mut port = port_guard.lock().unwrap();
        *port = request.headers().get("X-Real-Port").map(|e| e.clone());
        Ok(response)
    }).await.expect("Failed to accept.");

    let Some(addr) = unwrap_header_value(addr_guard) else {
        println!("Client request does not have header X-Real-IP. Ending connection.");
        return;
    };
    let Some(port) = unwrap_header_value(port_guard) else {
        println!("Client request does not have header X-Real-Port. Ending connection.");
        return;
    };
    let socket_addr = format!("{addr}:{port}").parse().unwrap(); // Reconstruct client socket addr from address and port.
    // let Some(addr): Option<Arc<str>> = addr_guard.lock().unwrap().clone().map(|header_value| header_value.to_str().map(|str| str).ok()).flatten().into() else {
    //     return;
    // };
    println!("New Connection: {addr}:{port}");

    let (mut ws_sender, mut ws_receiver) = ws_stream.split();
    let (board_to_client_tx, mut board_to_client_rx) = mpsc::unbounded_channel();

    event_tx.send((BoardEvent::NewConnection(board_to_client_tx), socket_addr)).expect("sent");

    loop {
        tokio::select! {
            packet = board_to_client_rx.recv() => {
                let Some(packet) = packet else {
                    // println!("Packet to send to client is none.");
                    break;
                };
                if ws_sender.send(Message::Binary(packet.encode())).await.is_err() {
                    // println!("Failed to send packet by websocket.");
                    break;
                }
            },
            message = ws_receiver.next() => {
                let Some(message) = message else {
                    println!("Message is None");
                    break;
                };
                let Ok(message) = message else {
                    println!("Message is Err");
                    continue;
                };
                match message {
                    Message::Binary(bytes) => {
                        let Ok(packet) = ClientToServerPacket::decode(&bytes) else {
                            // println!("Could not decode bytes receive from client.");
                            break;
                        };
                        match packet {
                            ClientToServerPacket::RevealSquare(coords) => {
                                println!("Reveal Square packet.");
                                event_tx.send((BoardEvent::RevealSquare(coords), socket_addr)).expect("sent");
                            }
                            ClientToServerPacket::ChordSquare(coords) => {
                                println!("Chord Square packet.");
                                event_tx.send((BoardEvent::ChordSquare(coords), socket_addr)).expect("sent");
                            }
                            ClientToServerPacket::ToggleFlagSquare(coords) => {
                                println!("Toggle flag packet.");
                                event_tx.send((BoardEvent::ToggleFlagSquare(coords), socket_addr)).expect("sent");
                            }
                            ClientToServerPacket::NewBoard => {
                                println!("New board requested.");
                                event_tx.send((BoardEvent::NewBoard, socket_addr)).expect("sent");
                            }
                            ClientToServerPacket::NextBoardConfig { width, height, num_mines } => {
                                println!("New board config requested.");
                                event_tx.send((BoardEvent::NextBoardConfig { width, height, num_mines }, socket_addr)).expect("sent");
                            }
                        }
                    }
                    Message::Close(..) => {
                        // println!("Connection closed.");
                        break;
                    }
                    _ => { }
                }
            }
        }
    }
    println!("Ending connection.");
}



fn send_to_all(senderss: Vec<&mut Vec<mpsc::UnboundedSender<encoding::ServerToClientPacket>>>, packet: ServerToClientPacket) {
    for ref mut senders in senderss {
        senders.retain(|sender| sender.send(packet.clone()).is_ok());
    }
}

// Possibly many-to-one function.
fn addr_to_key(addr: std::net::SocketAddr) -> String {
    addr.ip().to_string()
    // addr.to_string()
}

#[derive(Debug)]
struct BoardConfig {
    width: u16,
    height: u16,
    num_mines: u32,
}

enum StateInfo {
    Ongoing,
    Lost {loser_id: u8, hit_mines: Vec<(u16, u16)>, wrong_flags: Vec<(u16, u16)>},
    Won,
}

async fn board_handler(
    mut event_rx: mpsc::UnboundedReceiver<(BoardEvent, std::net::SocketAddr)>,
    nouns_path: String,
    adjectives_path: String,
) {
    let mut board_config = BoardConfig {
        width: 20,
        height: 20,
        num_mines: 80,
    };
    assert!(board::MultiplayerBoard::possible_config(board_config.width, board_config.height, board_config.num_mines));
    let mut board = board::MultiplayerBoard::new(
        board_config.width,
        board_config.height,
        board_config.num_mines,
    );

    let mut done_instant: Option<std::time::Instant> = None;
    let mut players = PlayerList::new(&nouns_path, &adjectives_path);
    let mut state_info = StateInfo::Ongoing;

    while let Some((event, addr)) = event_rx.recv().await {
        let addr_key = addr_to_key(addr);
        match event {
            BoardEvent::RevealSquare(coords) | BoardEvent::ChordSquare(coords) => {
                if coords.0 >= board.height() || coords.1 >= board.width() {
                    continue; // Ignore any input coords which are invalid.
                }

                let this_player_id = players.keep_addr_alive(&addr_key).unwrap();

                let prev_state = *board.board_state();

                let changed_coords = if let BoardEvent::RevealSquare(..) = event {
                    board.reveal_square(coords, this_player_id)
                } else if let BoardEvent::ChordSquare(..) = event {
                    board.chord_square(coords, this_player_id)
                } else {
                    panic!("Shouldn't arrive here");
                };

                if changed_coords.len() > 0 {
                    // Only send an update if something actually changed.
                    let updates: Vec<(u16, u16, u8, u8)> = changed_coords.iter().map(|coords| {
                            let entry = board.revealed_entry_at(*coords);
                            let player_id = board.player_at(*coords);
                            (coords.0, coords.1, encode_entry(&entry), player_id)
                        }).collect();
                    send_to_all(players.all_senders(), ServerToClientPacket::SparseBoard { updates });
                }

                if *board.board_state() == board::BoardState::Lost && prev_state != board::BoardState::Lost {
                    // Just lost game.
                    let wrong_flags = {
                        let mut out = vec![];
                        for i in 0..board.height() {
                            for j in 0..board.width() {
                                let coords = (i, j);
                                if board.revealed_entry_at(coords).is_flagged() && !board.true_entry_at(coords).unwrap().is_mine() {
                                    out.push(coords);
                                }
                            }
                        }
                        out
                    };
                    state_info = StateInfo::Lost { loser_id: this_player_id, hit_mines: changed_coords.clone(), wrong_flags: wrong_flags.clone() };
                    let packet = ServerToClientPacket::BoardLoss { loser_id: this_player_id, hit_mines: changed_coords, wrong_flags };
                    send_to_all(players.all_senders(), packet);

                    // Mark time lost.
                    done_instant = Some(std::time::Instant::now());
                } else if *board.board_state() == board::BoardState::Won && prev_state != board::BoardState::Won {
                    // Just won game.
                    state_info = StateInfo::Won;
                    send_to_all(players.all_senders(), ServerToClientPacket::BoardWin);

                    // Mark time won.
                    done_instant = Some(std::time::Instant::now());
                }
            }
            BoardEvent::ToggleFlagSquare(coords) => {
                if coords.0 >= board.height() || coords.1 >= board.width() {
                    continue; // Ignore any input coords which are invalid.
                }
                
                let this_player_id = players.keep_addr_alive(&addr_key).unwrap();

                if board.toggle_flag_square(coords, this_player_id) {
                    let entry = board.revealed_entry_at(coords);
                    let player_id = board.player_at(coords);
                    let updates = vec![(coords.0, coords.1, encode_entry(&entry), player_id)];
                    send_to_all(players.all_senders(), ServerToClientPacket::SparseBoard { updates });
                }
            }
            BoardEvent::NewConnection(board_to_client_tx) => {
                players.construct_player(&addr_key);
                let this_player = players.get_player(&addr_key).unwrap();
                let this_player_id = this_player.id();

                // Send the new connection their player info.
                let this_player_info = ServerToClientPacket::YourPlayerInfo {
                    player_id: this_player_id,
                    color: *this_player.color(),
                    name: this_player.name().to_string(),
                };
                board_to_client_tx.send(this_player_info).expect("Sent");
                // Send the new connection all the other players' infos.
                for player in players.players() {
                    let packet = ServerToClientPacket::PlayerInfo { 
                        player_id: player.id(),
                        color: *player.color(),
                        name: player.name().to_string(),
                    };
                    board_to_client_tx.send(packet).expect("sent");
                }   

                // Send the new connection the full board.
                let packet = ServerToClientPacket::FullBoard {
                    width: board.width(),
                    height: board.height(),
                    num_mines: board.num_mines(),
                    board_state: *board.board_state(),
                    entries: board.revealed_board().clone(),
                    player_ids: board.player_ids().clone(),
                };
                board_to_client_tx.send(packet).expect("sent");

                // Send the new connection the loss/win info if applicable.
                match &state_info {
                    &StateInfo::Lost { loser_id, ref hit_mines, ref wrong_flags } => {
                        let packet = ServerToClientPacket::BoardLoss { loser_id, hit_mines: hit_mines.clone(), wrong_flags: wrong_flags.clone() };
                        board_to_client_tx.send(packet).expect("sent");
                    }
                    &StateInfo::Won => {
                        board_to_client_tx.send(ServerToClientPacket::BoardWin).expect("sent");
                    }
                    _ => {}
                }

                // Send the new connection the next board configuration.
                board_to_client_tx.send(ServerToClientPacket::NextBoardConfig { 
                    width: board_config.width, 
                    height: board_config.height, 
                    num_mines: board_config.num_mines
                }).expect("sent");

                // Send the new player's info to all the other players.
                let player_info = ServerToClientPacket::PlayerInfo {
                    player_id: this_player_id,
                    color: *this_player.color(),
                    name: this_player.name().to_string(),
                };
                send_to_all(players.all_senders(), player_info);

                players.get_mut_senders(&addr_key).map(|ref mut senders| senders.push(board_to_client_tx));
            }
            BoardEvent::NewBoard => {
                if *board.board_state() == board::BoardState::Lost || *board.board_state() == board::BoardState::Won { // Only reset board if the current one is finished.
                    if done_instant.unwrap().elapsed() > MIN_DELAY_TILL_NEW_BOARD {
                        // Reset board.
                        board = board::MultiplayerBoard::new(
                            board_config.width,
                            board_config.height,
                            board_config.num_mines,
                        );

                        let packet = ServerToClientPacket::FullBoard {
                            width: board.width(),
                            height: board.height(),
                            num_mines: board.num_mines(),
                            board_state: *board.board_state(),
                            entries: board.revealed_board().clone(),
                            player_ids: board.player_ids().clone(),
                        };
                        send_to_all(players.all_senders(), packet);

                        done_instant = None;
                        state_info = StateInfo::Ongoing;
                    }
                }
            }
            BoardEvent::NextBoardConfig { width, height, num_mines } => {
                if board::MultiplayerBoard::possible_config(width, height, num_mines) {
                    board_config.width = width;
                    board_config.height = height;
                    board_config.num_mines = num_mines;

                    send_to_all(players.all_senders(), ServerToClientPacket::NextBoardConfig { width, height, num_mines });
                    println!("New board config: {:?}", board_config);
                } else {
                    println!("Invalid board config received: {width}x{height} with {num_mines} mines.");
                }
                
            }
        }
    }
}

#[derive(Parser)]
#[command(author, version, about, long_about = None)]
struct Args {
    #[arg(short, long, default_value_t = String::from("data/animals.txt"))]
    nouns_path: String,

    #[arg(short, long, default_value_t = String::from("data/adjectives.txt"))]
    adjectives_path: String,

    #[arg(short, long, default_value_t = 3002)]
    port: u16,
}

#[tokio::main]
async fn main() {
    let args = Args::parse();

    let (event_tx, event_rx) = mpsc::unbounded_channel();

    tokio::spawn(board_handler(event_rx, args.nouns_path, args.adjectives_path));

    let addr = format!("0.0.0.0:{}", args.port);
    let listener = TcpListener::bind(&addr).await.expect("Can't listen.");

    while let Ok((stream, _)) = listener.accept().await {
        tokio::spawn(accept_connection(stream, event_tx.clone()));
    }
}
