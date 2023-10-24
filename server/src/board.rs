use itertools::Itertools;
use rand::distributions::Distribution;

#[derive(Copy, Clone, PartialEq, Debug)]
pub enum Entry {
    Unknown { flagged: bool },
    Mine,
    Revealed { num_mines: u8 },
}

impl Entry {
    pub fn is_unknown(&self) -> bool {
        match self {
            &Entry::Unknown { .. } => true,
            _ => false,
        }
    }

    pub fn is_flagged(&self) -> bool {
        match self {
            &Entry::Unknown { flagged: true } => true,
            _ => false,
        }
    }

    pub fn is_mine(&self) -> bool {
        match self {
            &Entry::Mine => true,
            _ => false,
        }
    }
}

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum BoardState {
    Uninitialized,
    Ongoing,
    Lost,
    Won,
}

pub struct MultiplayerBoard {
    width: u16,
    height: u16,
    num_mines: u32,       // Total mines on board.
    entries_cleared: u32, // Total non-mine entries revealed so far.
    board_state: BoardState,
    // None if board hasn't been constructed yet. Indexed by (i, j) = (row, col).
    true_board: Option<Vec<Vec<Entry>>>,
    revealed_board: Vec<Vec<Entry>>, // Board revealed to player.
    player_ids: Vec<Vec<u8>>,        // Attributes entries to players.
}

impl MultiplayerBoard {
    pub fn new(width: u16, height: u16, num_mines: u32) -> MultiplayerBoard {
        MultiplayerBoard {
            width,
            height,
            num_mines,
            entries_cleared: 0,
            board_state: BoardState::Uninitialized,
            true_board: None,
            revealed_board: vec![
                vec![Entry::Unknown { flagged: false }; width as usize];
                height as usize
            ],
            player_ids: vec![vec![0; width as usize]; height as usize],
        }
    }

    pub fn width(&self) -> u16 {
        self.width
    }

    pub fn height(&self) -> u16 {
        self.height
    }

    pub fn num_mines(&self) -> u32 {
        self.num_mines
    }

    pub fn board_state(&self) -> &BoardState {
        &self.board_state
    }

    pub fn revealed_board(&self) -> &Vec<Vec<Entry>> {
        &self.revealed_board
    }

    pub fn player_ids(&self) -> &Vec<Vec<u8>> {
        &self.player_ids
    }

    pub fn true_entry_at(&self, coords: (u16, u16)) -> Option<Entry> {
        assert!(coords.0 < self.height && coords.1 < self.width);
        if let Some(ref true_board) = self.true_board {
            Some(true_board[coords.0 as usize][coords.1 as usize])
        } else {
            None
        }
    }

    pub fn revealed_entry_at(&self, coords: (u16, u16)) -> Entry {
        assert!(coords.0 < self.height && coords.1 < self.width);
        self.revealed_board[coords.0 as usize][coords.1 as usize]
    }

    pub fn player_at(&self, coords: (u16, u16)) -> u8 {
        assert!(coords.0 < self.height && coords.1 < self.width);
        self.player_ids[coords.0 as usize][coords.1 as usize]
    }

    // Reveals the given square and returns a list of squares which have been changed in the
    // revealed board.
    pub fn reveal_square(&mut self, reveal_coords: (u16, u16), player_id: u8) -> Vec<(u16, u16)> {
        assert!(reveal_coords.0 < self.height && reveal_coords.1 < self.width);
        match self.board_state {
            BoardState::Uninitialized => {
                assert!(self.true_board.is_none());
                let true_board = Self::construct_board(self.width, self.height, reveal_coords, self.num_mines);
                self.true_board = Some(true_board);
                self.board_state = BoardState::Ongoing;
                self.reveal_square(reveal_coords, 0) // Attribute board break to no one.
            }
            BoardState::Ongoing => {
                assert!(self.true_board.is_some());
                if !self.revealed_entry_at(reveal_coords).is_unknown() {
                    return vec![];
                }

                let true_board: &[Vec<Entry>] = self.true_board.as_ref().unwrap();

                // Reveal square clicked on.
                self.revealed_board[reveal_coords.0 as usize][reveal_coords.1 as usize] =
                    true_board[reveal_coords.0 as usize][reveal_coords.1 as usize];
                self.player_ids[reveal_coords.0 as usize][reveal_coords.1 as usize] = player_id;

                if self.revealed_entry_at(reveal_coords).is_mine() {
                    self.board_state = BoardState::Lost;
                    return vec![reveal_coords]; // Short-circuit if lose game.
                } else {
                    self.entries_cleared += 1;
                }

                // Reveal all squares adjacent to those which have 0 mines adjacent.
                let mut changed_coords = vec![reveal_coords];
                let mut unchecked_coords = vec![reveal_coords];
                while let Some(coords) = unchecked_coords.pop() {
                    if let Entry::Revealed { num_mines: 0 } = self.revealed_entry_at(coords) {
                        // Reveal all unrevealed adjacent entries.
                        for adjacent_coords in Self::adjacent_coords(coords, self.width, self.height) {
                            if self.revealed_entry_at(adjacent_coords).is_unknown() {
                                self.revealed_board[adjacent_coords.0 as usize]
                                    [adjacent_coords.1 as usize] = true_board
                                    [adjacent_coords.0 as usize]
                                    [adjacent_coords.1 as usize];
                                unchecked_coords.push(adjacent_coords);
                                changed_coords.push(adjacent_coords);
                                assert!(!self.revealed_entry_at(adjacent_coords).is_mine());
                                self.entries_cleared += 1;
                                // Attribute all extended reveals to no one.
                                self.player_ids[adjacent_coords.0 as usize]
                                    [adjacent_coords.1 as usize] = 0;
                            }
                        }
                    }
                }

                // Win condition.
                if self.entries_cleared == (self.width as u32) * (self.height as u32) - (self.num_mines as u32) {
                    self.board_state = BoardState::Won;
                }

                changed_coords
            }
            BoardState::Lost | BoardState::Won => {
                vec![]
            }
        }
    }

    // If a revealed square has its own number of flags adjacent, reveal the remaining adjacent squares.
    pub fn chord_square(&mut self, chord_coords: (u16, u16), player_id: u8) -> Vec<(u16, u16)> {
        assert!(chord_coords.0 < self.height && chord_coords.1 < self.width);
        match self.board_state {
            BoardState::Uninitialized | BoardState::Lost | BoardState::Won => {
                vec![]
            }
            BoardState::Ongoing => {
                // Check that chorded square is revealed.
                let Entry::Revealed { num_mines } = self.revealed_entry_at(chord_coords) else {
                    return vec![];
                };

                // Check that the number of adjacent flags matches the revealed square.
                let num_flags = Self::adjacent_coords(chord_coords, self.width, self.height)
                    .iter()
                    .filter(|coords| self.revealed_entry_at(**coords).is_flagged())
                    .count();
                if num_mines as usize != num_flags {
                    return vec![];
                }

                let mut changed_coords = vec![];
                let mut mines: Vec<(u16, u16)> = vec![];
                for coords in Self::adjacent_coords(chord_coords, self.width, self.height) {
                    let revealed_entry = self.revealed_entry_at(coords);
                    if revealed_entry.is_unknown() && !revealed_entry.is_flagged() {
                        let new_changed_coords = self.reveal_square(coords, player_id);
                        mines.extend(
                            new_changed_coords
                                .iter()
                                .filter(|coords| self.revealed_entry_at(**coords).is_mine()),
                        );
                        changed_coords.extend_from_slice(&new_changed_coords);
                    }
                }
                // changed_coords
                if mines.len() == 0 {
                    changed_coords
                } else {
                    mines
                }
            }
        }
    }

    // Returns true if toggled flag, false if not (e.g. wasn't a flaggable square).
    pub fn toggle_flag_square(&mut self, coords: (u16, u16), player_id: u8) -> bool {
        assert!(coords.0 < self.height && coords.1 < self.width);
        match self.board_state {
            BoardState::Uninitialized | BoardState::Ongoing => {
                if let Entry::Unknown { ref mut flagged } =
                    self.revealed_board[coords.0 as usize][coords.1 as usize]
                {
                    if *flagged == false {
                        *flagged = true;
                        self.player_ids[coords.0 as usize][coords.1 as usize] = player_id;
                    } else {
                        *flagged = false;
                        self.player_ids[coords.0 as usize][coords.1 as usize] = 0;
                    }
                    true
                } else {
                    false
                }
            }
            BoardState::Lost | BoardState::Won => false,
        }
    }

    // Returns true if there exists a first click that makes the following configuration possible.
    pub fn possible_config(width: u16, height: u16, num_mines: u32) -> bool {
        if width < 1 || height < 1  { 
            false
        } else if width > 100 || height > 100 { // TODO: fix client drawing code to remove this.
            false
        } else {
            num_mines <= (width as u32) * (height as u32)
        }
    }

    fn construct_board(
        width: u16,
        height: u16,
        first_click: (u16, u16),
        num_mines: u32,
    ) -> Vec<Vec<Entry>> {
        assert!(first_click.0 < height && first_click.1 < width);

        let mut true_board = vec![vec![Entry::Unknown { flagged: false }; width.into()]; height.into()];

        let mines: Vec<(u16, u16)> = if num_mines >= (width as u32) * (height as u32) {
            // Entire board is mines.
            let mut mines = vec![];
            for i in 0..height {
                for j in 0..width {
                    mines.push((i, j));
                }
            }
            mines
        } else {
            let mut rng = rand::thread_rng();
            let num_guaranteed_non_mine = Self::adjacent_coords(first_click, width, height).len() + 1;
            rand::distributions::Uniform::new(0, (width as u32) * (height as u32))
                .sample_iter(&mut rng)
                .map(|index| (u16::try_from(index / (width as u32)).unwrap(), u16::try_from(index % (width as u32)).unwrap()))
                .filter(|coords| if num_mines as usize + num_guaranteed_non_mine <= (width as usize) * (height as usize) {
                    !Self::adjacent(*coords, first_click) // Make all adjacent squares non-mines if possible.
                } else {
                    !(coords.0 == first_click.0 && coords.1 == first_click.1) // If all adjacent square can't be non-mines, then only make the clicked square itself non-mine.
                })
                .unique()
                .take(num_mines as usize)
                .collect()
        };
            
        assert!(mines.len() == num_mines as usize);

        // Board with values in {0, 1}, padded by zeros.
        let mut mine_board: Vec<Vec<u8>> = vec![vec![0; width as usize + 2]; height as usize + 2];

        for &(i, j) in mines.iter() {
            true_board[i as usize][j as usize] = Entry::Mine;
            mine_board[i as usize + 1][j as usize + 1] = 1;
        }

        // Count mines on squares that are on the interior.
        for i in 0..height as usize {
            for j in 0..width as usize {
                if true_board[i][j] != Entry::Mine {
                    let mut adjacent_mines = 0;
                    for k in i..(i + 3) {
                        for l in j..(j + 3) {
                            adjacent_mines += mine_board[k][l];
                        }
                    }
                    true_board[i][j] = Entry::Revealed {
                        num_mines: adjacent_mines,
                    };
                }
            }
        }
        true_board
    }

    fn adjacent(a: (u16, u16), b: (u16, u16)) -> bool {
        let (ai, aj) = a;
        let (bi, bj) = b;
        let idist = if ai >= bi { ai - bi } else { bi - ai };
        let jdist = if aj >= bj { aj - bj } else { bj - aj };
        idist <= 1 && jdist <= 1
    }

    // Returns coordinates adjacent to coords.
    fn adjacent_coords(coords: (u16, u16), width: u16, height: u16) -> Vec<(u16, u16)> {
        assert!(width >= 1 && height >= 1);
        let (i, j) = coords;
        assert!(i < height && j < width);
        if width == 1 && height == 1 {
            vec![]
        } else if width == 1 {
            // (n > 1) x 1
            assert!(j == 0);
            if i == 0 {
                vec![(i + 1, j)]
            } else if i == height - 1 {
                vec![(i - 1, j)]
            } else {
                vec![(i - 1, j), (i + 1, j)]
            }
        } else if height == 1 {
            // 1 x (n > 1)
            assert!(i == 0);
            if j == 0 {
                vec![(i, j + 1)]
            } else if j == width - 1 {
                vec![(i, j - 1)]
            } else {
                vec![(i, j - 1), (i, j + 1)]
            }
        } else if i == 0 && j == 0 {
            // Top-left corner.
            vec![(i, j + 1), (i + 1, j + 1), (i + 1, j)]
        } else if i == 0 && j == width - 1 {
            // Top-right corner.
            vec![(i + 1, j), (i + 1, j - 1), (i, j - 1)]
        } else if i == height - 1 && j == 0 {
            // Bottom-left corner.
            vec![(i - 1, j), (i - 1, j + 1), (i, j + 1)]
        } else if i == height - 1 && j == width - 1 {
            // Bottom-right corner.
            vec![(i, j - 1), (i - 1, j - 1), (i - 1, j)]
        } else if i > 0 && i < height - 1 && j == 0 {
            // Left side excluding corners.
            vec![(i - 1, j), (i - 1, j + 1), (i, j + 1), (i + 1, j + 1), (i + 1, j)]
        } else if i > 0 && i < height - 1 && j == width - 1 {
            // Right side excluding corners.
            vec![(i + 1, j), (i + 1, j - 1), (i, j - 1), (i - 1, j - 1), (i - 1, j)]
        } else if i == 0 && j > 0 && j < width - 1 {
            // Top side excluding corners.
            vec![(i, j + 1), (i + 1, j + 1), (i + 1, j), (i + 1, j - 1), (i, j - 1) ]
        } else if i == height - 1 && j > 0 && j < width - 1 {
            // Bottom side excluding corners.
            vec![(i, j - 1), (i - 1, j - 1), (i - 1, j), (i - 1, j + 1), (i, j + 1)]
        } else {
            // Interior of board.
            vec![(i, j + 1), (i + 1, j + 1), (i + 1, j), (i + 1, j - 1), (i, j - 1), (i - 1, j - 1), (i - 1, j), (i - 1, j + 1)]
        }
    }
}
