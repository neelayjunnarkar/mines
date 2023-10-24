use rand::rngs::StdRng;
use rand::SeedableRng;
use std::collections::HashMap;
use std::time;
use tokio::sync::mpsc;

use crate::encoding;
use crate::names;

const MAX_NUM_PLAYERS: usize = 255; // Must be (strictly) less than 256.

// Material UI 400
const COLORS: [[u8; 4]; 14] = [
    [0x8d, 0x6e, 0x63, 0xff], // brown 400
    // [0xff, 0x70, 0x43, 0xff], // deep orange 400
    [0xff, 0xa7, 0x26, 0xff], // orange 400
    [0xff, 0xca, 0x28, 0xff], // amber 400
    // [0xff, 0xee, 0x58, 0xff], // yellow 400
    [0xd4, 0xe1, 0x57, 0xff], // lime 400
    [0x9c, 0xcc, 0x65, 0xff], // light-green 400
    [0x66, 0xbb, 0x6a, 0xff], // green 400
    [0x26, 0xa6, 0x9a, 0xff], // teal 400
    [0x26, 0xc6, 0xda, 0xff], // cyan 400
    [0x29, 0xb6, 0xf6, 0xff], // light-blue 400
    [0x42, 0xa5, 0xf5, 0xff], // blue 400
    [0x56, 0x6b, 0xc0, 0xff], // indigo 400
    [0x7e, 0x57, 0xc2, 0xff], // deep purple 400
    [0xab, 0x47, 0xbc, 0xff], // purple 400
    [0xec, 0x40, 0x7a, 0xff], // pink 400
    // [0xef, 0x53, 0x50, 0xff], // red 400
];

pub struct Player {
    id: u8,
    last_interaction: time::Instant,
    name: String,
    color: [u8; 4], // RGBA
    senders: Vec<mpsc::UnboundedSender<encoding::ServerToClientPacket>>,
}

impl Player {
    pub fn id(&self) -> u8 {
        self.id
    }

    pub fn name(&self) -> &str {
        &self.name
    }

    pub fn color(&self) -> &[u8; 4] {
        &self.color
    }
}

pub struct PlayerList {
    // Manually ensure this has size less than
    player_by_addr: HashMap<String, Player>,
    name_gen: names::Generator<StdRng>,
}

impl PlayerList {
    pub fn new(nouns_path: &str, adjectives_path: &str) -> PlayerList {
        let nouns: Vec<String> = std::fs::read_to_string(nouns_path)
            .expect(&format!("nouns file {nouns_path} is missing"))
            .lines()
            .map(String::from)
            .collect();
        let adjectives: Vec<String> = std::fs::read_to_string(adjectives_path)
            .expect(&format!("adjectives file {adjectives_path} is missing"))
            .lines()
            .map(String::from)
            .collect();

        let rng = StdRng::from_entropy();

        PlayerList {
            player_by_addr: HashMap::new(),
            name_gen: names::Generator::new(adjectives, nouns, names::Name::Plain, rng),
        }
    }

    pub fn construct_player(&mut self, addr: &str) {
        if !self.player_by_addr.contains_key(addr) {
            let id = if self.player_by_addr.len() < MAX_NUM_PLAYERS {
                u8::try_from(self.player_by_addr.len() + 1).expect("error handling num players")
            } else {
                assert!(self.player_by_addr.len() == MAX_NUM_PLAYERS);
                let (replaced_addr, replaced_id) = self.player_by_addr.iter()
                    .min_by_key(|&(_, player)| player.last_interaction)
                    .map(|(ref addr, ref player)| ((*addr).clone(), player.id))
                    .unwrap();
                self.player_by_addr.remove(&replaced_addr);
                replaced_id
            };

            // TODO: make name and color guaranteed to be different from other players (as much as possible).
            let new_player = Player {
                id,
                last_interaction: time::Instant::now(),
                name: self.name_gen.next().unwrap_or(addr.to_string()),
                color: COLORS[id as usize % COLORS.len()],
                senders: vec![],
            };
            self.player_by_addr.insert(addr.to_string(), new_player);
        }
    }

    pub fn get_player(&self, addr: &str) -> Option<&Player> {
        self.player_by_addr.get(addr)
    }

    pub fn keep_addr_alive(&mut self, addr: &str) -> Option<u8> {
        if let Some(ref mut player) = self.player_by_addr.get_mut(addr) {
            player.last_interaction = time::Instant::now();
            Some(player.id)
        } else {
            None
        }
    }

    // TODO: turn this into an iterator.
    pub fn all_senders(&mut self) -> Vec<&mut Vec<mpsc::UnboundedSender<encoding::ServerToClientPacket>>> {
        let mut res = vec![];
        for &mut Player { ref mut senders, .. } in self.player_by_addr.values_mut() {
            res.push(senders);
        }
        res
    }

    pub fn players(&self) -> impl Iterator<Item = &Player> {
        self.player_by_addr.values()
    }

    pub fn get_mut_senders(
        &mut self, addr: &str
    ) -> Option<&mut Vec<mpsc::UnboundedSender<encoding::ServerToClientPacket>>> {
        if self.player_by_addr.contains_key(addr) {
            Some(&mut self.player_by_addr.get_mut(addr).unwrap().senders)
        } else {
            None
        }
    }
}
