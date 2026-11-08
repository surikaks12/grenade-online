const { test } = require('node:test');
const assert = require('node:assert/strict');
const G = require('../game');

const c = (rank, suit = '♠') => ({
    rank,
    suit,
    id: suit + rank,
});

function room() {
    return {
        phase: 'play',
        stage: 'discard',
        round: 1,
        turn: 'a',
        settings: {
            scoreOthers: true,
            declareTiming: 'before',
        },
        players: [
            {
                id: 'a',
                name: 'A',
                hand: [c(5)],
                score: 0,
                turnsStarted: 3,
            },
            {
                id: 'b',
                name: 'B',
                hand: [c(9)],
                score: 0,
                turnsStarted: 3,
            },
        ],
        deck: [c(7)],
        discard: [c(2)],
        available: [c(2)],
        pending: [],
    };
}

test('deck has 52 unique cards', () => {
    assert.equal(new Set(G.deck().map(c => c.id)).size, 52);
});

test('valid combinations with low and high aces', () => {
    const validHands = [
        [c(2)],
        [c(2), c(2, '♥')],
        [c(2), c(3), c(4)],
        [c(1), c(2), c(3)],
        [c(12), c(13), c(1)],
    ];

    for (const hand of validHands) {
        assert.ok(G.valid(hand));
    }

    const invalidHands = [
        [],
        [c(2), c(3)],
        [c(13), c(1), c(2)],
        [c(2), c(3, '♥'), c(4)],
    ];

    for (const hand of invalidHands) {
        assert.equal(G.valid(hand), false);
    }
});

test('successful declaration scores opponents', () => {
    let r = room();

    G.declare(r, r.players[0]);

    assert.equal(r.players[0].score, 0);
    assert.equal(r.players[1].score, 9);
});

test('ties catch; highest other hand sets penalty', () => {
    let r = room();

    r.players[1].hand = [c(5)];
    r.players.push({
        id: 'c',
        name: 'C',
        score: 0,
        hand: [c(10)],
    });

    G.declare(r, r.players[0]);

    assert.equal(r.players[0].score, 15);
    assert.equal(r.players[1].score, 0);
});

test('halving precedes elimination and occurs only once', () => {
    let r = room();

    r.players[0].score = 100;
    r.players[1].score = 241;

    G.declare(r, r.players[0]);

    assert.equal(r.players[0].score, 50);
    assert.equal(r.players[1].score, 125);
    assert.ok(!r.players[1].out);
});

test('strictly over 200 eliminated', () => {
    let r = room();

    r.players[1].score = 192;

    G.declare(r, r.players[0]);

    assert.equal(r.players[1].score, 201);
    assert.ok(r.players[1].out);
});

test('cannot draw own current play; previous card works', () => {
    let r = room();
    let p = r.players[0];

    G.play(r, p, [p.hand[0].id]);

    assert.throws(() => G.draw(r, p, 'previous', '♠5'));

    G.draw(r, p, 'previous', '♠2');

    assert.equal(p.hand[0].rank, 2);
    assert.equal(r.available[0].rank, 5);
    assert.equal(r.turn, 'b');
});

test('reject duplicate card ids and wrong turn', () => {
    let r = room();

    assert.throws(() => G.play(r, r.players[0], ['♠5', '♠5']));
    assert.throws(() => G.play(r, r.players[1], ['♠9']));
});

test('after-turn declaration requires completed draw', () => {
    let r = room();

    r.settings.declareTiming = 'after';

    assert.throws(() => G.declare(r, r.players[0]));

    G.play(r, r.players[0], ['♠5']);
    G.draw(r, r.players[0], 'deck');

    assert.equal(r.stage, 'declare');

    G.declare(r, r.players[0]);

    assert.equal(r.phase, 'results');
});

test('successful no-score mode', () => {
    let r = room();

    r.settings.scoreOthers = false;

    G.declare(r, r.players[0]);

    assert.ok(r.players.every(p => p.score === 0));
});

test('recycle protects previous play', () => {
    let r = room();

    r.deck = [];
    r.discard = [c(2), c(8)];

    G.play(r, r.players[0], ['♠5']);
    G.draw(r, r.players[0], 'deck');

    assert.equal(r.players[0].hand[0].rank, 8);
    assert.ok(r.discard.some(c => c.rank === 2));
});

test('five-card straight flush is valid', () => {
    assert.ok(G.valid([c(5), c(6), c(7), c(8), c(9)]));
});

test('ace can be high in a straight flush', () => {
    assert.ok(G.valid([c(12), c(13), c(1)]));
    assert.ok(G.valid([c(10), c(11), c(12), c(13), c(1)]));

    // No wrapping through the ace.
    assert.equal(G.valid([c(13), c(1), c(2)]), false);

    // Still requires matching suits.
    assert.equal(G.valid([c(12), c(13), c(1, '♥')]), false);
});

test('cannot declare before the third turn', () => {
    const r = room();
    const player = r.players[0];

    player.turnsStarted = 1;
    assert.throws(() => G.declare(r, player), /third turn/);

    player.turnsStarted = 2;
    assert.throws(() => G.declare(r, player), /third turn/);

    player.turnsStarted = 3;
    assert.doesNotThrow(() => G.declare(r, player));
});

test('turn counter increases when a player starts a turn', () => {
    const r = room();

    r.players[0].turnsStarted = 1;
    r.players[1].turnsStarted = 0;

    G.next(r);

    assert.equal(r.turn, 'b');
    assert.equal(r.players[1].turnsStarted, 1);

    G.next(r);

    assert.equal(r.turn, 'a');
    assert.equal(r.players[0].turnsStarted, 2);
});