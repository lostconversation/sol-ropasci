# ✊🖐✌️ Rock Paper Scissors on Solana

A lightning-fast, on-chain Rock Paper Scissors game built for Solana devnet!  
**No setup headaches. No mainnet risk. Just pure, animated fun in your terminal.**

---

## 🎮 What Is This?

A multiplayer Rock Paper Scissors game where every match is a Solana transaction!  
Challenge the blockchain, track your stats, and climb the leaderboard—all from your CLI.

---

## 🕹️ How It Works

```
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
|  👤 YOU      | ---> |  🤖 PROGRAM  | ---> |  ⛓️ SOLANA   |
|  Pick move   |      |  Verifies    |      |  Stores game |
|  Confirm tx  |      |  Animates!   |      |  Updates     |
└──────────────┘      └──────────────┘      └──────────────┘
```

- **You**: Pick rock, paper, or scissors in your terminal.
- **Program**: Animates, commits your move, and generates a blockchain-powered opponent.
- **Solana**: Stores your stats, streaks, and the global leaderboard—forever!

---

## 🚀 Features

- **CLI Animations**: Terminal battles with real-time effects!
- **On-Chain Stats**: Your wins, losses, and streaks are immortalized on Solana devnet.
- **Global Leaderboard**: Compete with everyone playing on devnet.
- **No Authority Needed**: Just your devnet wallet—no admin, no gatekeepers.
- **Super Simple Setup**: Clone, add wallet, play. That’s it!

---

## ⚡ Quick Start

### 1. Clone the Repo

```bash
git clone https://github.com/YOUR_USERNAME/rock-pap-scis.git
cd rock-pap-scis
```

### 2. Add Your Devnet Wallet

Edit `config.json` and paste your Solana devnet wallet path:

```json
{
  "player_wallet": "/Users/you/.config/solana/devnet.json"
}
```

> **Tip:** Use `solana-keygen new --outfile ~/.config/solana/devnet.json` if you need a wallet.

### 3. Install Dependencies

```bash
yarn install
```

### 4. Play!

```bash
yarn play
```

---

## 🛠️ Requirements

- [Node.js](https://nodejs.org/) (v16+)
- [Yarn](https://yarnpkg.com/)
- [Solana CLI](https://docs.solana.com/cli/install-solana-cli-tools)
- [Anchor CLI](https://book.anchor-lang.com/getting-started/installation.html)

---

## 🌐 Network

- **Devnet Only**: This game is for Solana devnet. No real SOL, no mainnet risk!

---

## 🏆 Now Go Play!

```bash
yarn play
```
