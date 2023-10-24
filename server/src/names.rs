// A modification of the https://github.com/fnichol/names to accept Rng other than ThreadRng.

use rand::{seq::SliceRandom, Rng};

pub enum Name {
    /// This represents a plain naming strategy of the form `"ADJECTIVE-NOUN"`
    Plain,
    /// This represents a naming strategy with a random number appended to the
    /// end, of the form `"ADJECTIVE-NOUN-NUMBER"`
    Numbered,
}

pub struct Generator<T: Rng> {
    adjectives: Vec<String>,
    nouns: Vec<String>,
    naming: Name,
    rng: T,
}

impl<T: Rng> Generator<T> {
    pub fn new(adjectives: Vec<String>, nouns: Vec<String>, naming: Name, rng: T) -> Self {
        Generator {
            adjectives,
            nouns,
            naming,
            rng,
        }
    }
}

impl<T: Rng> Iterator for Generator<T> {
    type Item = String;

    fn next(&mut self) -> Option<String> {
        let adj = self.adjectives.choose(&mut self.rng).unwrap();
        let noun = self.nouns.choose(&mut self.rng).unwrap();

        Some(match self.naming {
            Name::Plain => format!("{}-{}", adj, noun),
            Name::Numbered => format!("{}-{}-{:04}", adj, noun, rand_num(&mut self.rng)),
        })
    }
}

fn rand_num<T: Rng>(rng: &mut T) -> u16 {
    rng.gen_range(1..10000)
}
