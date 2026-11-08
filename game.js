const crypto = require('node:crypto');

// --------------------------------------------------
// Card values and hand totals
// --------------------------------------------------

/**
 * Return the point value of a card.
 *
 * Ranks:
 * - Ace: 1
 * - Number cards: their rank
 * - Jack, Queen, King: 10
 *
 * An ace still scores 1 even when used high in a straight flush.
 */
const value = card => Math.min(card.rank, 10);

/**
 * Calculate the total point value of a player's hand.
 */
const total = player =>
    player.hand.reduce((sum, card) => sum + value(card), 0);

// --------------------------------------------------
// Deck creation
// --------------------------------------------------

/**
 * Create and shuffle a standard 52-card deck.
 */
function deck() {
    const cards = [];
    const suits = ['♠', '♥', '♦', '♣'];

    // Create one card for each rank in each suit.
    for (const suit of suits) {
        for (let rank = 1; rank <= 13; rank++) {
            cards.push({
                id: `${suit}${rank}`,
                suit,
                rank,
            });
        }
    }

    // Fisher–Yates shuffle using randomly selected swap positions.
    for (let index = cards.length - 1; index > 0; index--) {
        const randomIndex = crypto.randomInt(index + 1);

        [cards[index], cards[randomIndex]] = [
            cards[randomIndex],
            cards[index],
        ];
    }

    return cards;
}

// --------------------------------------------------
// Play validation
// --------------------------------------------------

/**
 * Check whether a selection is a legal play.
 *
 * Legal plays:
 * - One card
 * - One pair
 * - Three of a kind
 * - Four of a kind
 * - A straight flush of at least three cards
 *
 * Straight flushes allow aces low or high, but not wraparound:
 * - A-2-3: valid
 * - Q-K-A: valid
 * - K-A-2: invalid
 */
function valid(cards) {
    if (cards.length === 0) {
        return false;
    }

    // A single card is always legal.
    if (cards.length === 1) {
        return true;
    }

    // Check for a pair, three of a kind, or four of a kind.
    const sameRank = cards.every(
        card => card.rank === cards[0].rank
    );

    if (
        cards.length >= 2 &&
        cards.length <= 4 &&
        sameRank
    ) {
        return true;
    }

    // All remaining legal combinations must be straight flushes.
    if (cards.length < 3) {
        return false;
    }

    const sameSuit = cards.every(
        card => card.suit === cards[0].suit
    );

    if (!sameSuit) {
        return false;
    }

    /**
     * Check that sorted ranks increase by exactly one.
     *
     * Copy the array before sorting so the original is unchanged.
     */
    function consecutive(ranks) {
        const sortedRanks = [...ranks].sort((a, b) => a - b);

        return sortedRanks.every(
            (rank, index) =>
                index === 0 || rank === sortedRanks[index - 1] + 1
        );
    }

    // Treat ace as rank 1 for low-ace runs.
    const lowRanks = cards.map(card => card.rank);

    // Treat ace as rank 14 for high-ace runs.
    const highRanks = cards.map(
        card => card.rank === 1 ? 14 : card.rank
    );

    return consecutive(lowRanks) || consecutive(highRanks);
}

// --------------------------------------------------
// Round setup
// --------------------------------------------------

/**
 * Start a new round for all players who have not been eliminated.
 */
function round(room) {
    const activePlayers = room.players.filter(player => !player.out);

    // A new round requires at least two surviving players.
    if (activePlayers.length < 2) {
        room.phase = 'finished';
        room.winner = activePlayers[0]?.id;
        return;
    }

    room.round++;

    // Reset the deck and public card piles.
    room.deck = deck();
    room.discard = [];
    room.available = [];
    room.pending = [];

    // Clear all hands, then deal five cards to each active player.
    for (const player of room.players) {
        player.hand = [];

        if (!player.out) {
            player.hand = room.deck.splice(0, 5);
        }
    }

    // The initial face-up card can be picked up by the first player.
    const firstCard = room.deck.pop();

    room.discard.push(firstCard);
    room.available = [firstCard];

    // Rotate the starting seat using the round number.
    const startingIndex = (room.round - 1) % activePlayers.length;

    room.turn = activePlayers[startingIndex].id;

    // Declaration eligibility resets at the beginning of each round.
    for (const player of room.players) {
        player.turnsStarted = 0;
    }

    const startingPlayer = room.players.find(
        player => player.id === room.turn
    );

    // The first player's first turn has already begun.
    startingPlayer.turnsStarted = 1;

    room.phase = 'play';
    room.stage = 'discard';
    room.message = `Round ${room.round} started.`;
}

// --------------------------------------------------
// Drawing from the deck
// --------------------------------------------------

/**
 * Draw one card from the deck.
 *
 * If the deck is empty, recycle older discards while preserving
 * the previous play's cards as available face-up pickup options.
 */
function drawDeck(room) {
    if (room.deck.length === 0) {
        const reservedIds = new Set(
            room.available.map(card => card.id)
        );

        // Only older, unavailable discards can return to the deck.
        const recycledCards = room.discard.filter(
            card => !reservedIds.has(card.id)
        );

        // Keep the previous play in the discard pile.
        room.discard = room.discard.filter(
            card => reservedIds.has(card.id)
        );

        // Shuffle the recycled cards.
        for (
            let index = recycledCards.length - 1;
            index > 0;
            index--
        ) {
            const randomIndex = crypto.randomInt(index + 1);

            [recycledCards[index], recycledCards[randomIndex]] = [
                recycledCards[randomIndex],
                recycledCards[index],
            ];
        }

        room.deck = recycledCards;
    }

    if (room.deck.length === 0) {
        throw Error(
            'No deck cards remain. Pick a card from the previous play.'
        );
    }

    return room.deck.pop();
}

// --------------------------------------------------
// Turn progression
// --------------------------------------------------

/**
 * Advance to the next active player and begin their discard step.
 */
function next(room) {
    const activePlayers = room.players.filter(player => !player.out);

    const currentIndex = activePlayers.findIndex(
        player => player.id === room.turn
    );

    // Wrap back to the first active player after the last seat.
    const nextIndex = (currentIndex + 1) % activePlayers.length;
    const nextPlayer = activePlayers[nextIndex];

    room.turn = nextPlayer.id;
    room.stage = 'discard';

    // Count turns when they begin, not when cards are played or drawn.
    nextPlayer.turnsStarted = (nextPlayer.turnsStarted || 0) + 1;
}

// --------------------------------------------------
// Playing cards
// --------------------------------------------------

/**
 * Remove a legal selection from the player's hand.
 *
 * Played cards remain pending until the player finishes drawing.
 * This prevents the player from picking up their own current play.
 */
function play(room, player, ids) {
    if (
        room.phase !== 'play' ||
        room.turn !== player.id ||
        room.stage !== 'discard'
    ) {
        throw Error('It is not your discard step.');
    }

    // Reject malformed selections and duplicate card IDs.
    if (
        !Array.isArray(ids) ||
        new Set(ids).size !== ids.length
    ) {
        throw Error('Invalid selection.');
    }

    // Resolve the selected IDs against the player's actual hand.
    const selectedCards = ids.map(
        id => player.hand.find(card => card.id === id)
    );

    const containsMissingCard = selectedCards.some(card => !card);

    if (containsMissingCard || !valid(selectedCards)) {
        throw Error(
            'Play a single card, pair, trips, four of a kind, ' +
            'or a same-suit run of at least three cards.'
        );
    }

    player.hand = player.hand.filter(
        card => !ids.includes(card.id)
    );

    room.pending = selectedCards;
    room.stage = 'draw';
    room.message = `${player.name} played ${selectedCards.length} card(s).`;
}

// --------------------------------------------------
// Drawing after a play
// --------------------------------------------------

/**
 * Draw exactly one card from:
 * - The deck, or
 * - The previous player's available cards
 *
 * After drawing, the current play becomes the next player's
 * available face-up pickup options.
 */
function draw(room, player, source, id) {
    if (
        room.phase !== 'play' ||
        room.turn !== player.id ||
        room.stage !== 'draw'
    ) {
        throw Error('Discard before drawing.');
    }

    let drawnCard;

    if (source === 'deck') {
        drawnCard = drawDeck(room);
    } else if (source === 'previous') {
        drawnCard = room.available.find(card => card.id === id);

        if (!drawnCard) {
            throw Error('Choose a card from the previous play.');
        }

        // Remove the picked-up card from the public discard pile.
        room.discard = room.discard.filter(card => card.id !== id);
    } else {
        throw Error('Invalid draw source.');
    }

    player.hand.push(drawnCard);

    // Finalize the current play now that drawing is complete.
    room.discard.push(...room.pending);
    room.available = [...room.pending];
    room.pending = [];

    if (room.settings.declareTiming === 'after') {
        // The player may declare or end their turn.
        room.stage = 'declare';
    } else {
        // In start-of-turn declaration mode, their turn is now complete.
        next(room);
    }
}

// --------------------------------------------------
// Declaring and scoring
// --------------------------------------------------

/**
 * End the round by declaring the player's hand total.
 *
 * A declaration is caught when any other active player has
 * an equal or lower hand total.
 */
function declare(room, player) {
    const requiredStage =
        room.settings.declareTiming === 'after'
            ? 'declare'
            : 'discard';

    if (
        room.phase !== 'play' ||
        room.turn !== player.id ||
        room.stage !== requiredStage
    ) {
        throw Error('You cannot declare at this point in your turn.');
    }

    // Players become eligible on their third turn of each round.
    if ((player.turnsStarted || 0) < 3) {
        throw Error(
            'You cannot declare until your third turn of this round.'
        );
    }

    const activePlayers = room.players.filter(
        activePlayer => !activePlayer.out
    );

    const otherPlayers = activePlayers.filter(
        otherPlayer => otherPlayer.id !== player.id
    );

    const declaredTotal = total(player);

    const caught = otherPlayers.some(
        otherPlayer => total(otherPlayer) <= declaredTotal
    );

    // Save original scores for the round-end score breakdown.
    const scoresBefore = Object.fromEntries(
        activePlayers.map(activePlayer => [
            activePlayer.id,
            activePlayer.score,
        ])
    );

    if (caught) {
        // Use the highest total among ALL other active players,
        // not only the players whose totals caught the declaration.
        const highestOtherTotal = Math.max(
            ...otherPlayers.map(total)
        );

        player.score += declaredTotal + highestOtherTotal;
    } else if (room.settings.scoreOthers) {
        // A successful declarer adds nothing.
        // Opponents score their own hands only if this setting is enabled.
        otherPlayers.forEach(otherPlayer => {
            otherPlayer.score += total(otherPlayer);
        });
    }

    // Reveal active players' hands once the round has ended.
    room.result = {
        declarer: player.name,
        total: declaredTotal,
        caught,
        hands: activePlayers.map(activePlayer => ({
            id: activePlayer.id,
            name: activePlayer.name,
            total: total(activePlayer),
            hand: [...activePlayer.hand],
        })),
    };

    // Apply one halving check per player, then check elimination.
    for (const activePlayer of activePlayers) {
        const scoreBeforeHalving = activePlayer.score;

        const halved =
            scoreBeforeHalving > 0 &&
            scoreBeforeHalving % 50 === 0;

        // This also applies to unchanged scores at positive multiples of 50.
        // It is intentionally a single check, not a repeated loop.
        if (halved) {
            activePlayer.score /= 2;
        }

        // Check elimination AFTER halving.
        activePlayer.out = activePlayer.score > 200;

        const handResult = room.result.hands.find(
            hand => hand.id === activePlayer.id
        );

        handResult.scoring = {
            before: scoresBefore[activePlayer.id],
            added: scoreBeforeHalving - scoresBefore[activePlayer.id],
            halved,
            after: activePlayer.score,
            out: activePlayer.out,
        };
    }

    room.phase = 'results';
    room.message = caught
        ? `${player.name} was caught!`
        : `${player.name} wins the round!`;

    // End the game when at most one player remains.
    const survivingPlayers = room.players.filter(
        activePlayer => !activePlayer.out
    );

    if (survivingPlayers.length <= 1) {
        room.phase = 'finished';
        room.winner = survivingPlayers[0]?.id;
    }
}

// --------------------------------------------------
// Public game-engine functions
// --------------------------------------------------

module.exports = {
    value,
    total,
    deck,
    valid,
    round,
    play,
    draw,
    declare,
    next,
};