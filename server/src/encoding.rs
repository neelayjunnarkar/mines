use crate::board;

#[derive(Debug)]
pub enum ClientToServerPacket {
    RevealSquare((u16, u16)),
    ToggleFlagSquare((u16, u16)),
    ChordSquare((u16, u16)),
    NewBoard,
    NextBoardConfig{width: u16, height: u16, num_mines: u32},
}

impl ClientToServerPacket {
    pub fn decode(bytes: &[u8]) -> Result<ClientToServerPacket, ()> {
        if bytes.len() < 1 {
            return Err(());
        }
        let packet_type = bytes[0];
        match packet_type {
            0 => {
                if bytes.len() != 5 {
                    Err(())
                } else {
                    let i = u16::from_le_bytes(bytes[1..3].try_into().unwrap());
                    let j = u16::from_le_bytes(bytes[3..5].try_into().unwrap());
                    Ok(ClientToServerPacket::RevealSquare((i, j)))
                }
            }
            1 => {
                if bytes.len() != 5 {
                    Err(())
                } else {
                    let i = u16::from_le_bytes(bytes[1..3].try_into().unwrap());
                    let j = u16::from_le_bytes(bytes[3..5].try_into().unwrap());
                    Ok(ClientToServerPacket::ChordSquare((i, j)))
                }
            },
            2 => {
                if bytes.len() != 5 {
                    Err(())
                } else {
                    let i = u16::from_le_bytes(bytes[1..3].try_into().unwrap());
                    let j = u16::from_le_bytes(bytes[3..5].try_into().unwrap());
                    Ok(ClientToServerPacket::ToggleFlagSquare((i, j)))
                }
            }
            3 => {
                if bytes.len() != 1 {
                    Err(())
                } else {
                    Ok(ClientToServerPacket::NewBoard)
                }
            }
            4 => {
                if bytes.len() != 9 {
                    Err(())
                } else {
                    let width = u16::from_le_bytes(bytes[1..3].try_into().unwrap());
                    let height = u16::from_le_bytes(bytes[3..5].try_into().unwrap());
                    let num_mines = u32::from_le_bytes(bytes[5..9].try_into().unwrap());
                    Ok(ClientToServerPacket::NextBoardConfig { width, height, num_mines })
                }
            }
            _ => Err(()),
        }
    }

}

#[derive(Debug, Clone)]
pub enum ServerToClientPacket {
    FullBoard {
        width: u16,
        height: u16,
        num_mines: u32,
        board_state: board::BoardState,
        entries: Vec<Vec<board::Entry>>,
        player_ids: Vec<Vec<u8>>,
    },
    SparseBoard {
        updates: Vec<(u16, u16, u8, u8)>,
    },
    PlayerInfo {
        player_id: u8,
        color: [u8; 4],
        name: String,
    },
    YourPlayerInfo {
        player_id: u8,
        color: [u8; 4],
        name: String,
    },
    BoardLoss {
        loser_id: u8,
        hit_mines: Vec<(u16, u16)>,
        wrong_flags: Vec<(u16, u16)>,
    },
    BoardWin,
    NextBoardConfig { width: u16, height: u16, num_mines: u32 },
}

impl ServerToClientPacket {
    pub fn encode(&self) -> Vec<u8> {
        let mut bytes = vec![];
        match self {
            &Self::FullBoard { width, height, num_mines, board_state, ref entries, ref player_ids } => {
                bytes.reserve_exact(1 + 2 + 2 + 4 + 1 +  2 * (width as usize) * (height as usize));
                bytes.push(0);
                bytes.extend_from_slice(&width.to_le_bytes());
                bytes.extend_from_slice(&height.to_le_bytes());
                bytes.extend_from_slice(&num_mines.to_le_bytes());
                match board_state {
                    board::BoardState::Uninitialized | board::BoardState::Ongoing => {
                        bytes.push(1);
                    }
                    board::BoardState::Lost => {
                        bytes.push(2);
                    }
                    board::BoardState::Won => {
                        bytes.push(3);
                    }
                }
                for i in 0..height as usize {
                    for j in 0..width as usize {
                        bytes.push(encode_entry(&entries[i][j]));
                    }
                }
                for i in 0..height as usize {
                    for j in 0..width as usize {
                        bytes.push(player_ids[i][j]);
                    }
                }
            }
            &Self::SparseBoard { ref updates } => {
                bytes.reserve_exact(1 + 6 * updates.len());
                bytes.push(1);
                for &(i, j, entry, player_id) in updates {
                    bytes.extend_from_slice(&i.to_le_bytes());
                    bytes.extend_from_slice(&j.to_le_bytes());
                    bytes.push(entry);
                    bytes.push(player_id);
                }
            }
            &Self::PlayerInfo { player_id, ref color, ref name } => {
                bytes.reserve_exact(1 + 1 + 4);
                bytes.push(2);
                bytes.push(player_id);
                bytes.extend_from_slice(color);
                bytes.extend_from_slice(name.as_bytes());
            }
            &Self::YourPlayerInfo {player_id, ref color, ref name} => {
                bytes.reserve_exact(1 + 1 + 4);
                bytes.push(3);
                bytes.push(player_id);
                bytes.extend_from_slice(color);
                bytes.extend_from_slice(name.as_bytes());
            }
            &Self::BoardLoss { loser_id, ref hit_mines, ref wrong_flags } => {
                bytes.reserve_exact(1 + 1 + 1 + 4*hit_mines.len() + 4*wrong_flags.len());
                bytes.push(4);
                bytes.push(loser_id);
                assert!(hit_mines.len() < u8::MAX as usize);
                bytes.push(u8::try_from(hit_mines.len()).unwrap());
                for &(i, j) in hit_mines {
                    bytes.extend_from_slice(&i.to_le_bytes());
                    bytes.extend_from_slice(&j.to_le_bytes());
                }
                for &(i, j) in wrong_flags {
                    bytes.extend_from_slice(&i.to_le_bytes());
                    bytes.extend_from_slice(&j.to_le_bytes());
                }
            }
            &Self::BoardWin => {
                bytes.reserve_exact(1);
                bytes.push(5);
            }
            &Self::NextBoardConfig { width, height, num_mines } => {
                bytes.reserve_exact(9);
                bytes.push(6);
                bytes.extend_from_slice(&width.to_le_bytes());
                bytes.extend_from_slice(&height.to_le_bytes());
                bytes.extend_from_slice(&num_mines.to_le_bytes());
            }
        }
        bytes
    }
}

pub fn encode_entry(entry: &board::Entry) -> u8 {
    match *entry {
        board::Entry::Unknown { flagged: false } => 253,
        board::Entry::Unknown { flagged: true } => 254,
        board::Entry::Mine => 255,
        board::Entry::Revealed { num_mines } => num_mines,
    }
}

/*
 * Server -> Client Message Format:
 *   Little Endian.
 *   u8: packet type
 *     0: full board.
 *     1: sparse board update.
 *     2: player info.
 *     3: your player info.
 *     4: board loss.
 *     5: board win.
 *     6: next board config.
 *   remainder: packet.
 * 
 * Full Board packet:
 *   Send a full board to client, resetting board to the following state. 
 *   u16: board width.
 *   u16: board height.
 *   u32: total number of mines on board.
 *   u8: board state.
 *     1: ongoing.
 *     2: lost.
 *     3: won.
 *   width*height u8s: entries. Index goes top to bottom, left to right.
 *     [0, 9]: Number of mines in/adjacent to square.
 *     [10, 252]: Unused.
 *     253: Unknown.
 *     254: Flag.
 *     255: Mine.
 *   width*height u8s: player ID. Index goes top to bottom, left to right.
 *     0: No player (e.g. initial clearing).
 *     [1, 255]: Player ID.
 * 
 * Sparse Board packet:
 *   Represents an update of the board the client already has.  
 *   Series of quadruples (u16: i, u16: j, u8: entry at index, u8: player ID)
 *
 * Player Info packet:
 *   Info associated with a player ID for a client to record or update. 
 *   u8: player ID.
 *   u8: R
 *   u8: G
 *   u8: B
 *   u8: A
 *   remaining: player name in UTF-8.
 *
 * Your Player Info packet:
 *   Info associated with the client itself.
 *   u8: player ID.
 *   u8: R
 *   u8: G
 *   u8: B
 *   u8: A
 *   remaining: player name in UTF-8.
 * 
 * Board Loss packet:
 *   Players have lost the game by clicking on a mine. 
 *   u8: player_id of player who clicked on mine.
 *   u8: number of clicked mines (more than 1 possible due to chording, but still less than 9).
 *   (number of clicked mines) * (u16, u16): series of (i, j) coordinates of the clicked mines.
 *   remaining in (u16, u16): series of (i, j) coordinates of incorrect flags.
 *
 * Board Win packet:
 *   Players have revealed all non-mine squares. 
 *   Empty. 
 * 
 * Next Board Config packet:
 *   Informs clients with what the configuration of the next board will be.
 *   u16: width.
 *   u16: height.
 *   u32: number of mines.
 */

/*
 * Client -> Server Message Format:
 *   Little Endian.
 *   u8: packet type.
 *     0: reveal square.
 *     1: chord.
 *     2: flag.
 *     3: new board.
 *     4: next board config.
 *
 * Reveal Square packet:
 *   Tells server that the player is requesting a square be revealed.
 *   u16: i
 *   u16: j
 *
 * Chord packet:
 *   Tells server that the player has chorded on a square.
 *   u16: i
 *   u16: j
 *
 * Flag packet:
 *   Tells server that the player has flagged a square.
 *   u16: i
 *   u16: j
 *
 * New Board packet:
 *   Empty.
 * 
 * Next Board Config packet:
 *   Requests that the next board have the following configuration.
 *   u16: width.
 *   u16: height.
 *   u32: number of mines.
 */
