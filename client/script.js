
/** Graphics **/

const MAX_ZOOM = 100;
const MIN_ZOOM = 1;
const SCROLL_SENSITIVITY = 0.0005;
const DRAG_THRESH = 12;


// Effects drawn on canvas are centered on a square and are up to the following times bigger than the square in each dimension.
const MAX_SQUARE_SCALE = 1.5;

const COLOR_UNKNOWN = "#bdbdbd";
const COLOR_PLAYER_0 = "#f5f5f5";
const COLOR_LOST = "#f44336";

// Resizing stuff.

let left_item = document.getElementById("left-item");
let middle_item = document.getElementById("canvas");
let right_item = document.getElementById("right-item");

let width_teller = document.getElementById("width-teller");

let hmax_cntr = document.getElementById("hmax-container");
let hmax_left_cntr = document.getElementById("hmax-left-container");
let hmax_mid_cntr = document.getElementById("hmax-middle-container");
let hmax_right_cntr = document.getElementById("hmax-right-container");
let hmax_height_teller = document.getElementById("hmax-height-teller");

let wmax_cntr = document.getElementById("wmax-container");
let wmax_left_cntr = document.getElementById("wmax-left-container");
let wmax_mid_cntr = document.getElementById("wmax-middle-container");
let wmax_right_cntr = document.getElementById("wmax-right-container");
let wmax_height_teller = document.getElementById("wmax-height-teller");

const DRAWING_STATE_UNKNOWN = 0;
const DRAWING_STATE_HMAX = 1;
const DRAWING_STATE_WMAX = 2;
let curr_drawing_state = DRAWING_STATE_UNKNOWN;

function resize(board_width, board_height) {
    const ymax = Math.max(wmax_height_teller.clientHeight, hmax_height_teller.clientHeight);
    const xmax = width_teller.clientWidth;

    const rem_px = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const gap = 2*rem_px; // Must be set according to gap between columns. 

    const canvas_aspect_ratio = (board_width + MAX_SQUARE_SCALE - 1) / (board_height + MAX_SQUARE_SCALE - 1);

    const candidate_width = canvas_aspect_ratio * ymax;
    const sidebar_width = left_item.getBoundingClientRect().width + right_item.getBoundingClientRect().width;
    const fits_row_layout = (candidate_width + sidebar_width + 2*gap) < xmax;

    if (fits_row_layout) {
        // Draw hmax
        if (curr_drawing_state === DRAWING_STATE_WMAX || curr_drawing_state === DRAWING_STATE_UNKNOWN) {
            curr_drawing_state = DRAWING_STATE_HMAX;

            hmax_left_cntr.appendChild(left_item);
            hmax_mid_cntr.appendChild(middle_item);
            hmax_right_cntr.appendChild(right_item);
            hmax_cntr.className = "flex flex-row w-full";
            wmax_cntr.className = "hidden flex-row justify-center";
        }

        middle_item.height = hmax_height_teller.clientHeight;
        middle_item.width = canvas_aspect_ratio * middle_item.height; 
    } else {
        // Draw wmax
        if (curr_drawing_state === DRAWING_STATE_HMAX || curr_drawing_state === DRAWING_STATE_UNKNOWN) {
            curr_drawing_state = DRAWING_STATE_WMAX;

            wmax_left_cntr.appendChild(left_item);
            wmax_mid_cntr.appendChild(middle_item);
            wmax_right_cntr.appendChild(right_item);
            wmax_cntr.className = "flex flex-row justify-center";
            hmax_cntr.className = "hidden flex-row w-full";
        }
        
        if (candidate_width < xmax) {
            middle_item.height = wmax_height_teller.clientHeight;
            middle_item.width = canvas_aspect_ratio * middle_item.height; 
        } else {
            middle_item.width = width_teller.clientWidth;
            middle_item.height = middle_item.width / canvas_aspect_ratio;
        }   
    }
}

function rgba_to_color(rgba) {
    const [r, g, b, a] = rgba;
    return "rgb(" + r + ", " + g + ", " + b + ", " + a + ")";
}

function hidpi_ctx(canvas) {
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = canvas.width + "px";
    canvas.style.height = canvas.height + "px";
    canvas.width *= dpr;
    canvas.height *= dpr;
    let ctx = canvas.getContext("2d");
    return ctx;
}

function set_camera(ctx, camera) {
    ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform.
    // Set camera perspective.
    ctx.translate(ctx.canvas.width/2, ctx.canvas.height/2);
    ctx.scale(camera.zoom, camera.zoom);    
    ctx.translate(-camera.offset_x, -camera.offset_y);
}

function draw_entry_update(ctx, board_width, board_height, update, player_info, clear_rect = true) {
    const canvas_width = ctx.canvas.width;
    const canvas_height = ctx.canvas.height;

    let side_len = canvas_width / (board_width + MAX_SQUARE_SCALE - 1);

    const scale = 0.9; // Scale down squares about their center to create gaps in between squares.
    console.assert(0 <= scale && scale <= MAX_SQUARE_SCALE);
    const radius = side_len / 20;
    const offset = (MAX_SQUARE_SCALE - 1) / 2;

    let y = offset*side_len + side_len*update.i;
    let x = offset*side_len + side_len*update.j;

    if (clear_rect) {
        ctx.clearRect(x, y, side_len, side_len);
    }
    
    y = y + (1 - scale)*side_len/2;
    x = x + (1 - scale)*side_len/2;

    side_len *= scale;
    
    if (update.player_id === 0) {
        if (update.entry === BOARD_ENTRY_UNKNOWN || update.entry === BOARD_ENTRY_FLAGGED) {
            ctx.fillStyle = COLOR_UNKNOWN;
        } else {
            ctx.fillStyle = COLOR_PLAYER_0;
        }
    } else {
        ctx.fillStyle = rgba_to_color(player_info.color);
    }
    
    ctx.beginPath();
    ctx.roundRect(x, y, side_len, side_len, [radius]);
    ctx.fill();

    // Draw entry
    const font_size = (side_len * (2/3)).toString() + "px";
    let font_family = "sans-serif";
    ctx.fillStyle = "#003049";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    let entry_string;
    switch (update.entry) {
        case BOARD_ENTRY_MINE:
            font_family = "Noto Color Emoji";
            entry_string = "💣";
            break;
        case BOARD_ENTRY_FLAGGED:
            font_family = "Noto Color Emoji";
            entry_string = "🚩";
            break;
        case BOARD_ENTRY_UNKNOWN:
            entry_string = "";
            break;
        case 0: // 0 Mines
            if (update.player_id == 0) {
                entry_string = "";
            } else {
                entry_string = "0";
            }            
            break;
        default:
            entry_string = update.entry.toString();
            break;
    }
    ctx.font = font_size + " " + font_family;
    ctx.fillText(entry_string, x + side_len/2, y + side_len/2, side_len);
}

function draw_full_board(ctx, board, player_ids, my_player_info, player_infos) {
    const canvas_width = ctx.canvas.width;
    const canvas_height = ctx.canvas.height;
    ctx.clearRect(0, 0, canvas_width, canvas_height);
    
    // ctx.beginPath();
    // ctx.rect(0, 0, canvas_width, canvas_height);
    // ctx.stroke();

    const board_width = board[0].length;
    const board_height = board.length;

    const clear_square = false;

    for (let i = 0; i < board_height; i++) {
        for (let j = 0; j < board_width; j++) {
            let player_info;
            if (player_infos.has(player_ids[i][j])) {
                player_info = player_infos.get(player_ids[i][j]);
            } else if (player_ids[i][j] === my_player_info.player_id) {
                player_info = my_player_info;
            }
            draw_entry_update(
                ctx, board_width, board_height,
                new SparseUpdate(i, j, board[i][j], player_ids[i][j]),
                player_info,
                clear_square
            );
        }
    }
}

function draw_loss_board(ctx, board, player_ids, my_player_info, player_infos, hit_mines, wrong_flags) {
    const canvas_width = ctx.canvas.width;
    const canvas_height = ctx.canvas.height;
    
    const board_width = board[0].length;
    const board_height = board.length;

    const scale = 1.5;
    console.assert(0 <= scale && scale <= MAX_SQUARE_SCALE);
    let side_len = canvas_width / (board_width + MAX_SQUARE_SCALE - 1);
    const offset = (MAX_SQUARE_SCALE - 1) / 2;
    const radius = scale * side_len / 20;

    // Fade the board a bit into white.
    ctx.fillStyle = "rgb(255, 255, 255, 0.5)";
    ctx.fillRect(0, 0, canvas_width, canvas_height);

    // First draw the red boxes.
    let c2 = document.createElement('canvas');
    c2.width = canvas_width;
    c2.height = canvas_height;
    let c2_ctx = c2.getContext("2d");
    c2_ctx.globalAlpha = 1;
    for (let mine_i = 0; mine_i < hit_mines.length; mine_i++) {
        const [i, j] = hit_mines[mine_i];
        const x = side_len*(offset + j + (1 - scale)/2);
        const y = side_len*(offset + i + (1 - scale)/2);
        c2_ctx.fillStyle = COLOR_LOST;
        c2_ctx.beginPath();
        c2_ctx.roundRect(x, y, scale*side_len, scale*side_len, [radius]);
        c2_ctx.fill();
        console.assert(board[i][j] == BOARD_ENTRY_MINE);
    }
    for (let flag_i = 0; flag_i < wrong_flags.length; flag_i++) {
        const [i, j] = wrong_flags[flag_i];
        const x = side_len*(offset + j + (1 - scale)/2);
        const y = side_len*(offset + i + (1 - scale)/2);
        c2_ctx.fillStyle = COLOR_LOST;
        c2_ctx.beginPath();
        c2_ctx.roundRect(x, y, scale*side_len, scale*side_len, [radius]);
        c2_ctx.fill();
        console.assert(board[i][j] == BOARD_ENTRY_FLAGGED);
    }
    ctx.globalAlpha = 0.75;
    ctx.drawImage(c2, 0, 0);
    ctx.globalAlpha = 1;

    // Overlay the highlighted boxes.
    for (let mine_i = 0; mine_i < hit_mines.length; mine_i++) {
        const [i, j] = hit_mines[mine_i];
        console.assert(board[i][j] == BOARD_ENTRY_MINE);
        const update = new SparseUpdate(i, j, board[i][j], player_ids[i][j]);
        let player_info;
        if (player_infos.has(update.player_id)) {
            player_info = player_infos.get(update.player_id);
        } else if (update.player_id === my_player_info.player_id) {
            player_info = my_player_info;
        }
        draw_entry_update(ctx, board_width, board_height, update, player_info, false);
    }
    for (let flag_i = 0; flag_i < wrong_flags.length; flag_i++) {
        const [i, j] = wrong_flags[flag_i];
        console.assert(board[i][j] == BOARD_ENTRY_FLAGGED);
        const update =  new SparseUpdate(i, j, board[i][j], player_ids[i][j]);
        let player_info;
        if (player_infos.has(update.player_id)) {
            player_info = player_infos.get(update.player_id);
        } else if (update.player_id === my_player_info.player_id) {
            player_info = my_player_info;
        }
        draw_entry_update(ctx, board_width, board_height, update, player_info, false);
    }
}

function draw_win_board(ctx, board, player_ids, my_player_info, player_infos, winners) {
    const canvas_width = ctx.canvas.width;
    const canvas_height = ctx.canvas.height;

    const board_width = board[0].length;
    const board_height = board.length;

    const scale = 1.5;
    console.assert(0 <= scale && scale <= MAX_SQUARE_SCALE);
    let side_len = canvas_width / (board_width + MAX_SQUARE_SCALE - 1);
    const offset = (MAX_SQUARE_SCALE - 1) / 2;
    const radius = scale * side_len / 20;

    // Fade the board a bit into white.
    ctx.fillStyle = "rgb(255, 255, 255, 0.5)";
    ctx.fillRect(0, 0, canvas_width, canvas_height);

    // First draw the box shadows in the winners color.
    for (const winner_id of winners) {
        let winner_info;
        if (my_player_info.player_id === winner_id) {
            winner_info = my_player_info;
        } else if (player_infos.has(winner_id)) {
            winner_info = player_infos.get(winner_id);
        } else {
            winner_info = my_player_info;
            console.assert(winner_id === 0);
        }
        let c2 = document.createElement('canvas');
        c2.width = ctx.canvas.width;
        c2.height = ctx.canvas.height;
        let c2_ctx = hidpi_ctx(c2);
        c2_ctx.globalAlpha = 1;
        c2_ctx.fillStyle = rgba_to_color(winner_info.color);
        for (let i = 0; i < board_height; i++) {
            for (let j = 0; j < board_width; j++) {
                if (player_ids[i][j] === winner_id) {
                    const x = side_len*(offset + j + (1 - scale)/2);
                    const y = side_len*(offset + i + (1 - scale)/2);                
                    c2_ctx.beginPath();
                    c2_ctx.roundRect(x, y, scale*side_len, scale*side_len, [radius]);
                    c2_ctx.fill();
                }
            }
        }
        ctx.globalAlpha = 0.6;
        ctx.drawImage(c2, 0, 0);
        ctx.globalAlpha = 1;
    }

    // Overlay the highlighted boxes.
    for (let i = 0; i < board_height; i++) {
        for (let j = 0; j < board_width; j++) {
            if (winners.includes(player_ids[i][j])) {
                const winner_id = player_ids[i][j];
                let winner_info;
                if (my_player_info.player_id === winner_id) {
                    winner_info = my_player_info;
                } else {
                    winner_info = player_infos.get(winner_id);
                }
                draw_entry_update(ctx, board_width, board_height, new SparseUpdate(i, j, board[i][j], player_ids[i][j]), winner_info, false);
            }
        }
    }
}

function get_winners(scores) {
    let highest_score = -Infinity; 
    let winners = [0];
    for (let [id, score] of scores.entries()) {
        if (id === 0) {
            continue;
        }
        if (score > highest_score) {
            highest_score = score;
            winners = [id];
        } else if (score == highest_score) {
            winners.push(id);
        }
    }
    return winners;
}

function get_losers(player_ids, hit_mines, wrong_flags) {
    let losers = [];
    for (let hit_mine_i = 0; hit_mine_i < hit_mines.length; hit_mine_i++) {
        const [i, j] = hit_mines[hit_mine_i];
        losers.push(player_ids[i][j]);
    }
    for (let wrong_flag_i = 0; wrong_flag_i < wrong_flags.length; wrong_flag_i++) {
        const [i, j] = wrong_flags[wrong_flag_i];
        losers.push(player_ids[i][j]);
    }
    return losers;
}

// Draw full board and win or loss overlays if applicable.
function draw_board(state) {
    draw_full_board(state.ctx, state.board, state.player_ids, state.my_player_info, state.player_infos);
    if (state.board_state === BOARD_STATE_LOST && state.hit_mines != null && state.wrong_flags != null) {
        const losers = get_losers(state.player_ids, state.hit_mines, state.wrong_flags);
        draw_loss_board(state.ctx, state.board, state.player_ids, state.my_player_info, state.player_infos, state.hit_mines, state.wrong_flags);
        draw_scores(state.scores, state.my_player_info, state.player_infos, [], losers);
    } else if (state.board_state === BOARD_STATE_WON) {
        const winners = get_winners(state.scores);
        draw_win_board(state.ctx, state.board, state.player_ids, state.my_player_info, state.player_infos, winners);
        draw_scores(state.scores, state.my_player_info, state.player_infos, winners);
    }
}

function create_table_row(name, color, score, is_winner = false, is_loser = false) {
    let row_elem = document.createElement("tr");
    let prize_elem = document.createElement("th");
    let name_elem = document.createElement("td");
    let score_elem = document.createElement("td");

    prize_elem.scope = "row";
    name_elem.textContent = name;
    name_elem.style.color = color;
    score_elem.textContent = score;

    if (is_winner) {
        prize_elem.className = "text-3xl font-bold pl-4 py-2 text-center";
        name_elem.className = "text-3xl font-bold px-4 py-2";
        score_elem.className = "text-3xl font-bold px-4 py-2";
    } else {
        prize_elem.className = "text-xl font-medium pl-4 py-2 text-center";
        name_elem.className = "text-xl font-medium px-4 py-2";
        score_elem.className = "text-xl font-medium px-4 py-2";
    }

    if (is_winner) {
        prize_elem.textContent = "👑";
    } else if (is_loser) {
        prize_elem.textContent = "❌"; // "🤡";
    } else {
        prize_elem.textContent = "";
    }

    row_elem.append(prize_elem);
    row_elem.append(name_elem);
    row_elem.append(score_elem);
    return row_elem;
}

// Draw scores to the HTML.
function draw_scores(scores, my_player_info, player_infos, winner_ids = [], loser_ids = []) {
    // Set this player's name on page.
    document.getElementById("this-player-name-main").textContent = my_player_info.name;
    document.getElementById("this-player-name-main").style.color = rgba_to_color(my_player_info.color);

    // Clear table.
    table = document.getElementById("table-body-scores");
    while (table.firstChild) {
        // The list is LIVE so it will re-index each call
        table.removeChild(table.firstChild);
    }

    // Add this player's score to table.
    if (scores.has(my_player_info.player_id)) {
        const is_winner = winner_ids.includes(my_player_info.player_id);
        const is_loser = loser_ids.includes(my_player_info.player_id);
        table.append(create_table_row(my_player_info.name, rgba_to_color(my_player_info.color), scores.get(my_player_info.player_id), is_winner, is_loser));
    } else {
        const is_winner = winner_ids.includes(my_player_info.player_id);
        const is_loser = loser_ids.includes(my_player_info.player_id);
        table.append(create_table_row(my_player_info.name, rgba_to_color(my_player_info.color), 0, is_winner, is_loser));
    }
    
    // Add all other players' scores to table.
    for (let [player_id, player_info] of player_infos.entries()) {
        if (player_id !== my_player_info.player_id && scores.has(player_id)) {
            const is_winner = winner_ids.includes(player_id);
            const is_loser = loser_ids.includes(player_id);
            table.append(create_table_row(player_info.name, rgba_to_color(player_info.color), scores.get(player_info.player_id), is_winner, is_loser));
        }
    }   
}

function draw_board_info(num_flags, num_mines, height, width) {
    document.getElementById("num-flags").textContent = num_flags;
    document.getElementById("num-mines").textContent = num_mines;
    document.getElementById("board-dimensions").textContent = width.toString() + " x " + height.toString();
}

function draw_next_board_config(width, height, num_mines) {
    document.getElementById("next-board-config-width").textContent = width.toString();
    document.getElementById("next-board-config-height").textContent = height.toString();
    document.getElementById("next-board-config-num-mines").textContent = num_mines.toString();
}

/** Encoding & Decoding **/

const SERVER_TO_CLIENT_PACKET_FULL_BOARD = 0;
const SERVER_TO_CLIENT_PACKET_SPARSE_BOARD = 1;
const SERVER_TO_CLIENT_PACKET_PLAYER_INFO = 2;
const SERVER_TO_CLIENT_PACKET_YOUR_PLAYER_INFO = 3;
const SERVER_TO_CLIENT_PACKET_BOARD_LOSS = 4;
const SERVER_TO_CLIENT_PACKET_BOARD_WIN = 5;
const SERVER_TO_CLIENT_PACKET_NEXT_BOARD_CONFIG = 6;

const CLIENT_TO_SERVER_PACKET_REVEAL_SQUARE = 0;
const CLIENT_TO_SERVER_PACKET_CHORD_SQUARE = 1;
const CLIENT_TO_SERVER_PACKET_TOGGLE_FLAG = 2;
const CLIENT_TO_SERVER_PACKET_NEW_BOARD = 3;
const CLIENT_TO_SERVER_PACKET_NEXT_BOARD_CONFIG = 4;

class ServerToClientPacketFullBoard {
    // board and player_ids are 2d arrays indexed by row, col order.
    constructor(height, width, num_mines, board_state, board, player_ids) {
        this.type = SERVER_TO_CLIENT_PACKET_FULL_BOARD;
        this.height = height;
        this.width = width;
        this.num_mines = num_mines;
        this.board_state = board_state;
        this.board = board;
        this.player_ids = player_ids;
    }
}

class SparseUpdate {
    constructor(i, j, entry, player_id) {
        this.i = i;
        this.j = j;
        this.entry = entry;
        this.player_id = player_id;
    }
}
class ServerToClientPacketSparseBoard {
    // updates is an array of SparseUpdate.
    constructor(updates) {        
        this.type = SERVER_TO_CLIENT_PACKET_SPARSE_BOARD;
        this.updates = updates;
    }
}

class ServerToClientPacketPlayerInfo {
    // player_id is a number.
    // rgba is a list in the format [[0, 255], [0, 255], [0, 255], [0, 1]].
    // name is a string.
    constructor(player_id, rgba, name) {
        this.type = SERVER_TO_CLIENT_PACKET_PLAYER_INFO;
        this.player_id = player_id;
        this.rgba = rgba;
        this.name = name;
    }
}

class ServerToClientPacketYourPlayerInfo {
    // player_id is a number.
    // rgba is a list in the format [[0, 255], [0, 255], [0, 255], [0, 1]].
    // name is a string.
    constructor(player_id, rgba, name) {
        this.type = SERVER_TO_CLIENT_PACKET_YOUR_PLAYER_INFO;
        this.player_id = player_id;
        this.rgba = rgba;
        this.name = name;
    }
}

class ServerToClientPacketBoardLoss {
    constructor(loser_id, hit_mines, wrong_flags) {
        this.type = SERVER_TO_CLIENT_PACKET_BOARD_LOSS;
        this.loser_id = loser_id;
        this.hit_mines = hit_mines;
        this.wrong_flags = wrong_flags;
    }
}

class ServerToClientPacketBoardWin {
    constructor() {
        this.type = SERVER_TO_CLIENT_PACKET_BOARD_WIN;
    }
}

class ServerToClientPacketNextBoardConfig {
    constructor(width, height, num_mines) {
        this.type = SERVER_TO_CLIENT_PACKET_NEXT_BOARD_CONFIG;
        this.width = width;
        this.height = height;
        this.num_mines = num_mines;
    }
}

class ClientToServerPacketRevealSquare {
    constructor(i, j) {
        this.type = CLIENT_TO_SERVER_PACKET_REVEAL_SQUARE;
        this.i = i;
        this.j = j;
    }
}

class ClientToServerPacketChordSquare {
    constructor(i, j) {
        this.type = CLIENT_TO_SERVER_PACKET_CHORD_SQUARE;
        this.i = i;
        this.j = j;
    }
}

class ClientToServerPacketToggleFlag {
    constructor(i, j) {
        this.type = CLIENT_TO_SERVER_PACKET_TOGGLE_FLAG;
        this.i = i;
        this.j = j;
    }
}

class ClientToServerPacketNewBoard {
    constructor() {
        this.type = CLIENT_TO_SERVER_PACKET_NEW_BOARD;
    }
}

class ClientToServerPacketNextBoardConfig {
    constructor(width, height, num_mines) {
        this.type = CLIENT_TO_SERVER_PACKET_NEXT_BOARD_CONFIG;
        this.width = width;
        this.height = height;
        this.num_mines = num_mines;
    }
}

// Decode bytes from server into a packet.
function decode_bytes(bytes) {
    const bytes_view = new DataView(bytes);
    console.assert(bytes.byteLength >= 1);
    const packet_type = bytes_view.getUint8(0);
    let packet;
    switch (packet_type) {
        case SERVER_TO_CLIENT_PACKET_FULL_BOARD: {
            console.assert(bytes.byteLength >= 10);
            const width = bytes_view.getUint16(1, true);
            const height = bytes_view.getUint16(3, true);
            const num_mines = bytes_view.getUint32(5, true);
            const board_state = bytes_view.getUint8(9);
            console.assert(bytes.byteLength == 1 + 2 + 2 + 4 + 1 + width*height + width*height);

            let byte_pos = 10;

            board = new Array(height);
            for (let i = 0; i < height; i++) {
                let row = new Array(width);
                for (let j = 0; j < width; j++) {
                    row[j] = bytes_view.getUint8(byte_pos);
                    byte_pos++;
                }
                board[i] = row;
            }

            let player_ids = new Array(height);
            for (let i = 0; i < height; i++) {
                let row = new Array(width);
                for (let j = 0; j < width; j++) {
                row[j] = bytes_view.getUint8(byte_pos);
                byte_pos++;
                }
                player_ids[i] = row;
            }
            packet = new ServerToClientPacketFullBoard(height, width, num_mines, board_state, board, player_ids);
            break;
        }
        case SERVER_TO_CLIENT_PACKET_SPARSE_BOARD: {
            console.assert((bytes.byteLength - 1) % 6 === 0);

            let byte_pos = 1;
            let updates_i = 0;
            let updates = new Array((bytes.byteLength - 1) / 6);
            while (byte_pos < bytes.byteLength) {
                console.assert(byte_pos + 5 < bytes.byteLength);

                const i = bytes_view.getUint16(byte_pos, true);
                byte_pos += 2;
                const j = bytes_view.getUint16(byte_pos, true);
                byte_pos += 2;
                const entry = bytes_view.getUint8(byte_pos);
                byte_pos++;
                const player_id = bytes_view.getUint8(byte_pos);
                byte_pos++;

                updates[updates_i] = new SparseUpdate(i, j, entry, player_id);
                updates_i++;
            }
            packet = new ServerToClientPacketSparseBoard(updates);
            break;
        }
        case SERVER_TO_CLIENT_PACKET_PLAYER_INFO: {
            console.assert(bytes.byteLength >= 5);
            const player_id = bytes_view.getUint8(1);
            const r = bytes_view.getUint8(2);
            const g = bytes_view.getUint8(3);
            const b = bytes_view.getUint8(4);
            const a = bytes_view.getUint8(5);
            let utf8decoder = new TextDecoder();
            const name = utf8decoder.decode(new Uint8Array(bytes.slice(6)));
            const rgba = [r, g, b, a/255]; // "rgb(" + r + ", " + g + ", " + b + ", " + a/255 + ")" ;
            packet = new ServerToClientPacketPlayerInfo(player_id, rgba, name);
            break;
        }
        case SERVER_TO_CLIENT_PACKET_YOUR_PLAYER_INFO: {
            console.assert(bytes.byteLength >= 5);
            const player_id = bytes_view.getUint8(1);
            const r = bytes_view.getUint8(2);
            const g = bytes_view.getUint8(3);
            const b = bytes_view.getUint8(4);
            const a = bytes_view.getUint8(5);
            let utf8decoder = new TextDecoder();
            const name = utf8decoder.decode(new Uint8Array(bytes.slice(6)));
            const rgba = [r, g, b, a/255]; // "rgb(" + r + ", " + g + ", " + b + ", " + a/255 + ")" ;
            packet = new ServerToClientPacketYourPlayerInfo(player_id, rgba, name);
            break;
        }
        case SERVER_TO_CLIENT_PACKET_BOARD_LOSS: {
            console.assert(bytes.byteLength >= 3 && (bytes.byteLength - 3) % 4 == 0);
            const loser_id = bytes_view.getUint8(1);
            const num_mines_hit = bytes_view.getUint8(2);
            console.assert(bytes.byteLength >= 3 + 4*num_mines_hit);
            let byte_pos = 3;
            let hit_mines = new Array(num_mines_hit);
            for (let idx = 0; idx < num_mines_hit; idx++) {
                console.assert(byte_pos + 3 < bytes.byteLength);
                const i = bytes_view.getUint16(byte_pos, true);
                byte_pos += 2;
                const j = bytes_view.getUint16(byte_pos, true);
                byte_pos += 2;
                hit_mines[idx] = [i, j];
            }
            console.assert((bytes.byteLength - byte_pos) % 4 == 0);
            const num_wrong_flags = (bytes.byteLength - byte_pos) / 4;
            let wrong_flags = new Array(num_wrong_flags);
            for (let idx = 0; idx < num_wrong_flags; idx++) {
                console.assert(byte_pos + 3 < bytes.byteLength);
                const i = bytes_view.getUint16(byte_pos, true);
                byte_pos += 2;
                const j = bytes_view.getUint16(byte_pos, true);
                byte_pos += 2;
                wrong_flags[idx] = [i, j];
            }
            packet = new ServerToClientPacketBoardLoss(loser_id, hit_mines, wrong_flags);
            break;
        }
        case SERVER_TO_CLIENT_PACKET_BOARD_WIN: {
            console.assert(bytes.byteLength === 1);
            packet = new ServerToClientPacketBoardWin();
            break;
        }
        case SERVER_TO_CLIENT_PACKET_NEXT_BOARD_CONFIG: {
            console.assert(bytes.byteLength === 9);
            const width = bytes_view.getUint16(1, true);
            const height = bytes_view.getUint16(3, true);
            const num_mines = bytes_view.getUint32(5, true);
            packet = new ServerToClientPacketNextBoardConfig(width, height, num_mines);
            break;
        }
        default:
            console.log("Received packet with unknown type ", packet_type);
    }
    return packet;
}

// Encode packet into bytes to be sent to server.
function encode_packet(packet) {
    let bytes;
    switch (packet.type) {
        case CLIENT_TO_SERVER_PACKET_REVEAL_SQUARE: {
            bytes = new ArrayBuffer(1 + 2 + 2);
            let view = new DataView(bytes);
            view.setUint8(0, CLIENT_TO_SERVER_PACKET_REVEAL_SQUARE);
            view.setUint16(1, packet.i, true);
            view.setUint16(3, packet.j, true);
            break;
        }
        case CLIENT_TO_SERVER_PACKET_CHORD_SQUARE: {
            bytes = new ArrayBuffer(1 + 2 + 2);
            let view = new DataView(bytes);
            view.setUint8(0, CLIENT_TO_SERVER_PACKET_CHORD_SQUARE);
            view.setUint16(1, packet.i, true);
            view.setUint16(3, packet.j, true);
            break;
        }
        case CLIENT_TO_SERVER_PACKET_TOGGLE_FLAG: {
            bytes = new ArrayBuffer(1 + 2 + 2);
            let view = new DataView(bytes);
            view.setUint8(0, CLIENT_TO_SERVER_PACKET_TOGGLE_FLAG);
            view.setUint16(1, packet.i, true);
            view.setUint16(3, packet.j, true);
            break;
        }
        case CLIENT_TO_SERVER_PACKET_NEW_BOARD: {
            bytes = new ArrayBuffer(1);
            let view = new DataView(bytes);
            view.setUint8(0, CLIENT_TO_SERVER_PACKET_NEW_BOARD);
            break;
        }
        case CLIENT_TO_SERVER_PACKET_NEXT_BOARD_CONFIG: {
            bytes = new ArrayBuffer(9);
            let view = new DataView(bytes);
            view.setUint8(0, CLIENT_TO_SERVER_PACKET_NEXT_BOARD_CONFIG);
            view.setUint16(1, packet.width, true);
            view.setUint16(3, packet.height, true);
            view.setUint32(5, packet.num_mines, true);
            break;
        }
        default:
            console.log("Trying to send packet with unknown type ", packet.type);
    }
    return bytes;
}

/** Client Logic **/

const BOARD_STATE_UNKNOWN = 0;
const BOARD_STATE_ONGOING = 1;
const BOARD_STATE_LOST = 2;
const BOARD_STATE_WON = 3;

class State {
    constructor() {
        this.board = null;
        this.player_ids = null;
        this.my_player_info = null;
        this.player_infos = new Map();
        this.scores = new Map();
        this.num_mines = null;
        this.num_flags = null;
        this.board_state = BOARD_STATE_UNKNOWN;
        this.canvas = document.getElementById("canvas");
        this.ctx = null;
        this.camera = {zoom: 1, offset_x: 0, offset_y: 0};
        // Only used if board_state is LOST.
        this.hit_mines = null;
        this.wrong_flags = null;
    }
}

const BOARD_ENTRY_UNKNOWN = 253;
const BOARD_ENTRY_FLAGGED = 254;
const BOARD_ENTRY_MINE    = 255;

class PlayerInfo {
    constructor(player_id, name, color) {
        this.player_id = player_id;
        this.name = name;
        this.color = color;
    }
}

// A player's score is the number of non-mine entries they've revealed.
function entry_score(entry) {
    if (0 <= entry && entry <= 9) {
        return 1;
    } else {
        return 0;
    }
}

// Returns a map from player ID to score.
function compute_scores(board, player_ids) {
    let scores = new Map();
    for (let i = 0; i < board.length; i++) {
        for (let j = 0; j < board[0].length; j++) {
            const player_id = player_ids[i][j];
            const entry = board[i][j];
            // Note: player 0 is not an actual player.
            if (player_id !== 0) {
                if (scores.has(player_id)) {
                    scores.set(player_id, scores.get(player_id) + entry_score(entry));
                } else {
                    scores.set(player_id, entry_score(entry));
                }
            }            
        }
    }
    return scores;
}

function count_flags(board) {
    let num_flags = 0;
    for (let i = 0; i < board.length; i++) {
        for (let j = 0; j < board[0].length; j++) {
            if (board[i][j] == BOARD_ENTRY_FLAGGED) {
                num_flags++;
            }
        }
    }
    return num_flags;
}

function handle_packet(packet, state) {
    switch (packet.type) {
        case SERVER_TO_CLIENT_PACKET_FULL_BOARD: {
            console.log("Full board.");
            state.board = packet.board;
            state.player_ids = packet.player_ids;
            state.num_mines = packet.num_mines;
            state.board_state = packet.board_state;
            state.scores = compute_scores(state.board, state.player_ids);

            // Resize canvas.
            resize(state.board[0].length, state.board.length);
            state.ctx = hidpi_ctx(state.canvas);
            state.camera.offset_x = state.canvas.width / 2;
            state.camera.offset_y = state.canvas.height / 2;
            set_camera(state.ctx, state.camera);

            draw_board(state);

            draw_scores(state.scores, state.my_player_info, state.player_infos);

            state.num_flags = count_flags(state.board);
            draw_board_info(state.num_flags, state.num_mines, state.board.length, state.board[0].length);
            break;
        }
        case SERVER_TO_CLIENT_PACKET_SPARSE_BOARD: {
            console.log("Sparse update.");
            state.board_state = BOARD_STATE_ONGOING;
            for (let updates_i = 0; updates_i < packet.updates.length; updates_i++) {
                const update = packet.updates[updates_i];

                // Subtract score of previous player who had score for this entry.
                const old_player_id = state.player_ids[update.i, update.j];
                if (state.scores.has(old_player_id)) {
                    state.scores.set(old_player_id, state.scores.get(old_player_id) - 1);
                }

                if (state.board[update.i][update.j] === BOARD_ENTRY_FLAGGED && update.entry !== BOARD_ENTRY_FLAGGED) {
                    // Decrement number of flag if flag has been toggled off.
                    state.num_flags--;
                } else if (state.board[update.i][update.j] !== BOARD_ENTRY_FLAGGED && update.entry === BOARD_ENTRY_FLAGGED) {
                    // Increment number of flags if unknown square has been flagged.
                    state.num_flags++;
                }

                // Update entry.
                state.board[update.i][update.j] = update.entry;
                state.player_ids[update.i][update.j] = update.player_id;

                // Update this player's score.
                if (state.scores.has(update.player_id)) {
                    state.scores.set(update.player_id, state.scores.get(update.player_id) + entry_score(update.entry));
                } else {
                    state.scores.set(update.player_id, entry_score(update.entry));
                }
                
                let player_info;
                if (state.player_infos.has(update.player_id)) {
                    player_info = state.player_infos.get(update.player_id);
                } else if (update.player_id === state.my_player_info.player_id) {
                    player_info = state.my_player_info;
                }
                draw_entry_update(state.ctx, state.board[0].length, state.board.length, update, player_info);
                draw_scores(state.scores, state.my_player_info, state.player_infos);
                draw_board_info(state.num_flags, state.num_mines, state.board.length, state.board[0].length);
            }
            break;
        }
        case SERVER_TO_CLIENT_PACKET_PLAYER_INFO: {
            console.log("Player info.");
            if (state.player_infos.has(packet.player_id)) {
                // Update information regarding this player.
                let player_info = state.player_infos.get(packet.player_id);
                player_info.name = packet.name;
                player_info.color = packet.rgba;
            } else {
                // Add new player to map.
                let player_info = new PlayerInfo(packet.player_id, packet.name, packet.rgba);
                state.player_infos.set(player_info.player_id, player_info);
            }
            break;
        }
        case SERVER_TO_CLIENT_PACKET_YOUR_PLAYER_INFO: {
            console.log("My player info.");
            state.my_player_info = new PlayerInfo(packet.player_id, packet.name, packet.rgba);
            break;
        }
        case SERVER_TO_CLIENT_PACKET_BOARD_LOSS: {
            console.log("Board loss.");
            state.board_state = BOARD_STATE_LOST;
            state.hit_mines = packet.hit_mines;
            state.wrong_flags = packet.wrong_flags;
            
            // Reset camera to view whole board.
            state.camera.zoom = 1;
            state.camera.offset_x = state.canvas.width/2;
            state.camera.offset_y = state.canvas.height/2;
            set_camera(state.ctx, state.camera);

            draw_board(state);
            break;
        }
        case SERVER_TO_CLIENT_PACKET_BOARD_WIN: {
            console.log("Board win.");
            state.board_state = BOARD_STATE_WON;

            // Reset camera to view whole board.
            state.camera.zoom = 1;
            state.camera.offset_x = state.canvas.width/2;
            state.camera.offset_y = state.canvas.height/2;
            set_camera(state.ctx, state.camera);

            draw_board(state);
            break;
        }
        case SERVER_TO_CLIENT_PACKET_NEXT_BOARD_CONFIG: {
            console.log("Next board config.");
            draw_next_board_config(packet.width, packet.height, packet.num_mines);
            break;
        }
        default:
            console.log("Received packet with unknown type ", packet.type);
    }
}

// Convert from canvas style size to canvas size.
function event_loc(x, y, canvas) {
    return [x*canvas.width/canvas.getBoundingClientRect().width, y*canvas.height/canvas.getBoundingClientRect().height];
}

function loc_to_square_coords(board_height, board_width, canvas_width, canvas_height, camera, x, y) {
    const side_len = canvas_width / ((board_width + MAX_SQUARE_SCALE - 1));
    const offset = (MAX_SQUARE_SCALE - 1) / 2;
    
    x = camera.offset_x - canvas_width/(2*camera.zoom) + x/camera.zoom;
    y = camera.offset_y - canvas_height/(2*camera.zoom) + y/camera.zoom;

    const i = Math.floor((y - offset*side_len) / side_len);
    const j = Math.floor((x - offset*side_len) / side_len);

    return [i, j];
}

function clamp(x, min, max) {
    return Math.min(max, Math.max(min, x));
}

/** Init **/

const UINT16_MAX = 65535;
const UINT32_MAX = 4294967295;

const SOCKET_TIMEOUT_INIT = 100; // milliseconds.
const SOCKET_TIMEOUT_MAX = 1000; // milliseconds.
let timeout = SOCKET_TIMEOUT_INIT;

let socket;

let state = new State();

let is_drag = false;
let last_drag_pos;
let left_mouse_down = false;
let right_mouse_down = false;
let middle_mouse_down = false;

let controls_reveal = document.getElementById("primary-button-controls-reveal");
let controls_toggle_flag = document.getElementById("primary-button-controls-toggle-flag");
let primary_button_reveal = true; // If false, then primary button is toggle flag.
let submit_board_cfg_button = document.getElementById("next-board-config-button");

function setup_socket() {
    socket = new WebSocket("wss://mines.neelay.net/websocket/");
    socket.binaryType = "arraybuffer";

    socket.addEventListener("open", (event) => {
        timeout = SOCKET_TIMEOUT_INIT;
        console.log("socket connected");
    });
    socket.addEventListener("close", (event) => {
        console.log("socket closed");
        setTimeout(() => {
            setup_socket();
        }, timeout);
        timeout = Math.min(2*timeout, SOCKET_TIMEOUT_MAX);
        console.log("New timeout is ", timeout);
    });
    socket.addEventListener("error", (event) => {
        console.log("socket errored");
        socket.close();
    });
    socket.addEventListener("message", (event) => {
        if (event.data instanceof ArrayBuffer) {
            packet = decode_bytes(event.data);
            handle_packet(packet, state);
        } else {
            console.log("Message from server ", event.data);
        }
    });
}

setup_socket();

// Set up event listeners.

// Mouse listeners
state.canvas.addEventListener("wheel", (event) => {
    event.preventDefault(); // Prevent scrolling on canvas from also scrolling webpage.

    // Adjust zoom.
    const new_zoom = clamp(state.camera.zoom * Math.pow(1 - SCROLL_SENSITIVITY, event.deltaY), MIN_ZOOM, MAX_ZOOM);
    const scale = new_zoom / state.camera.zoom;

    // Adjust camera offset so that zoom is centered on mouse position.
    const [ezx, ezy] = event_loc(event.offsetX, event.offsetY, state.canvas);
    const xz = state.camera.offset_x + (ezx - state.canvas.width/2)/state.camera.zoom;
    const yz = state.camera.offset_y + (ezy - state.canvas.height/2)/state.camera.zoom;
    state.camera.offset_x = xz - (xz - state.camera.offset_x) / scale;
    state.camera.offset_y = yz - (yz - state.camera.offset_y) / scale;

    state.camera.zoom = new_zoom;

    // Adjust camera offset to ensure only viewing board.
    const bound_scaler = 1/(2*state.camera.zoom);
    state.camera.offset_x = clamp(state.camera.offset_x, state.canvas.width*bound_scaler, state.canvas.width*(1 - bound_scaler));
    state.camera.offset_y = clamp(state.camera.offset_y, state.canvas.height*bound_scaler, state.canvas.height*(1 - bound_scaler));

    set_camera(state.ctx, state.camera);

    draw_board(state);
}, { passive: false });
// Combine chording with mouse pan.
state.canvas.addEventListener("mousedown", (event) => {
    switch (event.button) {
        case 0: {
            left_mouse_down = true;
            break;
        }
        case 1: {
            const [x, y] = event_loc(event.offsetX, event.offsetY, state.canvas);
            last_drag_pos = {x: x, y: y};
            is_drag = false;
            middle_mouse_down = true;
            break;
        }
        case 2: {
            right_mouse_down = true;
            break;
        }
    }
});
state.canvas.addEventListener("mousemove", (event) => {
    if (middle_mouse_down && !is_drag) {
        const [x, y] = event_loc(event.offsetX, event.offsetY, state.canvas);
        if (Math.abs(x - last_drag_pos.x) >= DRAG_THRESH || Math.abs(y - last_drag_pos.y) >= DRAG_THRESH) {
            is_drag = true;
        }
    }
    if (middle_mouse_down && is_drag) {
        const [x, y] = event_loc(event.offsetX, event.offsetY, state.canvas);
        const bound_scaler = 1/(2*state.camera.zoom);
        const delta_x = -(clamp(state.camera.offset_x - (x - last_drag_pos.x)/state.camera.zoom, state.canvas.width*bound_scaler, state.canvas.width*(1 - bound_scaler)) - state.camera.offset_x);
        const delta_y = -(clamp(state.camera.offset_y - (y - last_drag_pos.y)/state.camera.zoom, state.canvas.height*bound_scaler, state.canvas.height*(1 - bound_scaler)) - state.camera.offset_y);
        
        last_drag_pos = {x: x, y: y};

        state.camera.offset_x = state.camera.offset_x - delta_x;
        state.camera.offset_y = state.camera.offset_y - delta_y;

        set_camera(state.ctx, state.camera);

        draw_board(state);
    }
});
state.canvas.addEventListener("mouseup", (event) => {
    if (event.button === 1 || ((event.button === 0 || event.button === 2) && left_mouse_down && right_mouse_down)) {
        if (is_drag) {
        } else {
            const [x, y] = event_loc(event.offsetX, event.offsetY, state.canvas);
            const [i, j] = loc_to_square_coords(state.board.length, state.board[0].length, state.canvas.width, state.canvas.height, state.camera, x, y);
            socket.send(encode_packet(new ClientToServerPacketChordSquare(i, j)));
        }
    }

    if (event.button === 0) {
        left_mouse_down = false;
    } else if (event.button === 1) {
        middle_mouse_down = false;
        is_drag = false;
    } else if (event.button === 2) {
        right_mouse_down = false;
    }
});
state.canvas.addEventListener("mouseleave", (event) => {
    left_mouse_down = false;
    middle_mouse_down = false;
    right_mouse_down = false;
})
state.canvas.addEventListener("click", (event) => { // Left click.
    const [x, y] = event_loc(event.offsetX, event.offsetY, state.canvas);
    const [i, j] = loc_to_square_coords(state.board.length, state.board[0].length, state.canvas.width, state.canvas.height, state.camera, x, y);
    if (state.board_state === BOARD_STATE_LOST || state.board_state === BOARD_STATE_WON) {
        socket.send(encode_packet(new ClientToServerPacketNewBoard()));
    } else if (event.shiftKey) { // Shift left click is chord.
        socket.send(encode_packet(new ClientToServerPacketChordSquare(i, j)));
    } else if (primary_button_reveal) {
        socket.send(encode_packet(new ClientToServerPacketRevealSquare(i, j)));
    } else {
        socket.send(encode_packet(new ClientToServerPacketToggleFlag(i, j)));
    }
});
state.canvas.addEventListener("contextmenu", (event) => { // Right click.
    event.preventDefault();
    const [x, y] = event_loc(event.offsetX, event.offsetY, state.canvas);
    const [i, j] = loc_to_square_coords(state.board.length, state.board[0].length, state.canvas.width, state.canvas.height, state.camera, x, y);
    const bytes = encode_packet(new ClientToServerPacketToggleFlag(i, j));
    socket.send(bytes);
});

// Window resize handler
resize(1, 1);
addEventListener("resize", (event) => {
    old_width = state.canvas.width;
    old_height = state.canvas.height;
    
    resize(state.board[0].length, state.board.length);
    state.ctx = hidpi_ctx(state.canvas);
    
    // Scale camera to give the same view on the new canvas size.
    state.camera.offset_x = (state.camera.offset_x / old_width) * state.canvas.width;
    state.camera.offset_y = (state.camera.offset_y / old_height) * state.canvas.height;
    set_camera(state.ctx, state.camera);
    
    draw_board(state);
});

// Primary button controls handler.
controls_reveal.addEventListener("click", (event) => {
    primary_button_reveal = true;
    console.log("Set primary button controls to reveal.");
});
controls_toggle_flag.addEventListener("click", (event) => {
    primary_button_reveal = false;
    console.log("Set primary button controls to toggle flag.");
});

// New board configuration handler.
submit_board_cfg_button.addEventListener("click", (event) => {
    const width_text = document.getElementById("next-board-width").value;
    const height_text = document.getElementById("next-board-height").value;
    const num_mines_text = document.getElementById("next-board-num-mines").value;
    if (width_text === "" || height_text === "" || num_mines_text === "") { // Check that input text is a number. Note that the <input> tag makes the string empty if not a number.
        // TODO: handle invalid input.
        console.log("Invalid next board configuration.");
        return;
    }
    const width = Number(width_text);
    const height = Number(height_text);
    const num_mines = Number(num_mines_text);
    if (!Number.isInteger(width) || !Number.isInteger(height) || !Number.isInteger(num_mines)) {
        // TODO: handle invalid input.
        console.log("Invalid next board configuration.");
        return;
    }
    if (width < 0 || width > UINT16_MAX || height < 0 || height > UINT16_MAX || num_mines < 0 || num_mines > UINT32_MAX - 3) {
        // TODO: handle invalid input.
        console.log("Invalid next board configuration.");
        return;
    }

    // TODO: optimize board drawing so these restrictions can be removed.
    if (width > 100 || height > 100) {
        // TODO: handle invalid input.
        console.log("Invalid next board configuration.");
        return;
    }

    const bytes = encode_packet(new ClientToServerPacketNextBoardConfig(width, height, num_mines));
    socket.send(bytes);
    console.log("Submit board config:", width, "x", height, "with", num_mines, "mines");
});
