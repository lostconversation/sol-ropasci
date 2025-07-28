import * as anchor from "@coral-xyz/anchor";
import * as readline from "readline";
import * as fs from "fs";
import * as path from "path";

// Force UTF-8 encoding
process.stdout.setDefaultEncoding("utf8");
process.stdin.setDefaultEncoding("utf8");

// Leaderboard helper: get top 5 by games won and win rate
async function getLeaderboard(program: any) {
  try {
    console.log("\n\n\nFetching leaderboard data...");

    // Get all program accounts without filters first
    const accounts = await program.provider.connection.getProgramAccounts(
      program.programId
    );

    // Deserialize each account individually and handle errors
    const allPlayerStats = [];
    for (const account of accounts) {
      try {
        const playerStats = await program.account.playerStats.fetch(
          account.pubkey
        );
        allPlayerStats.push({
          publicKey: account.pubkey,
          account: playerStats,
        });
      } catch (e) {
        // Skip accounts that can't be deserialized as playerStats
        continue;
      }
    }

    const activePlayers = allPlayerStats.filter(
      (p: any) => p.account.gamesPlayed.toNumber() > 0
    );

    console.log(`Active players: ${activePlayers.length}`);

    if (activePlayers.length === 0) {
      return { topWinners: [], topWinRate: [], topStreaks: [] };
    }

    // Top 5 by games won
    const topWinners = [...activePlayers]
      .sort(
        (a, b) => b.account.gamesWon.toNumber() - a.account.gamesWon.toNumber()
      )
      .slice(0, 5);

    // Top 5 by win rate (min 5 games played)
    const topWinRate = [...activePlayers]
      .filter((p) => p.account.gamesPlayed.toNumber() >= 5)
      .sort((a, b) => {
        const aRate =
          a.account.gamesWon.toNumber() / a.account.gamesPlayed.toNumber();
        const bRate =
          b.account.gamesWon.toNumber() / b.account.gamesPlayed.toNumber();
        return bRate - aRate;
      })
      .slice(0, 5);

    // Top 5 by highest streak
    const topStreaks = [...activePlayers]
      .sort(
        (a, b) =>
          b.account.highestStreak.toNumber() -
          a.account.highestStreak.toNumber()
      )
      .slice(0, 5);

    return { topWinners, topWinRate, topStreaks };
  } catch (e) {
    console.log("Error in getLeaderboard:", e);
    return { topWinners: [], topWinRate: [], topStreaks: [] };
  }
}

async function initializeGame() {
  const configPath = path.join(__dirname, "..", "config.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

  // Get player wallet path from config.json
  if (!config.player_wallet) {
    throw new Error(
      "Could not find player_wallet path in config.json. Please set 'player_wallet' in your config.json file."
    );
  }
  const playerPath = config.player_wallet.replace(
    "~",
    process.env.HOME || process.env.USERPROFILE || ""
  );

  const playerKeypair = anchor.web3.Keypair.fromSecretKey(
    Buffer.from(JSON.parse(fs.readFileSync(playerPath, "utf8")))
  );

  // Create provider with player wallet
  const connection = new anchor.web3.Connection(
    config.devnet.url,
    config.devnet.commitment
  );
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(playerKeypair),
    {}
  );
  anchor.setProvider(provider);

  const program = anchor.workspace.rps as any;

  console.log("Player wallet:", playerKeypair.publicKey.toString());

  // Calculate PDAs using player wallet
  const [gameStatePda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("game_state")],
    program.programId
  );

  const [playerStatsPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("player_stats"), playerKeypair.publicKey.toBuffer()],
    program.programId
  );

  return {
    program,
    connection,
    provider,
    playerKeypair,
    gameStatePda,
    playerStatsPda,
  };
}

// Helper to prompt for name
async function promptForName(rl: readline.Interface): Promise<string> {
  return new Promise((resolve) => {
    rl.question("Enter your player name: ", (answer) => {
      const clean = answer.trim().slice(0, 8);
      resolve(clean);
    });
  });
}

// Helper to encode name to [u8; 8]
function encodeName(name: string): number[] {
  const bytes = Array.from(Buffer.from(name, "ascii"));
  while (bytes.length < 8) bytes.push(0);
  return bytes.slice(0, 8);
}

async function showMainUI(gameContext: any) {
  const {
    program,
    connection,
    provider,
    playerKeypair,
    gameStatePda,
    playerStatsPda,
  } = gameContext;

  // Get player move
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (query: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(query, resolve);
    });
  };

  let isNewPlayer = false;
  let playerStats;
  try {
    playerStats = await program.account.playerStats.fetch(playerStatsPda);
    isNewPlayer = false;
  } catch (e) {
    isNewPlayer = true;
  }

  let playerNameBytes: number[] | undefined = undefined;
  let playerName: string | undefined = undefined;
  if (isNewPlayer) {
    console.log("\n\n\n\n\n\nWelcome, new player!");
    console.log("Your wallet:", playerKeypair.publicKey.toString());
    console.log("Account:", playerStatsPda.toString());
    playerName = await promptForName(rl);
    // Validate name: ASCII, max 8 chars, non-empty
    if (
      !playerName ||
      playerName.length === 0 ||
      playerName.length > 8 ||
      /[^\x20-\x7E]/.test(playerName)
    ) {
      console.log("Invalid name. Must be 1-8 ASCII characters.");
      rl.close();
      return true;
    }
    playerNameBytes = encodeName(playerName);
  } else {
    // Welcome back existing player
    const name = Buffer.from(playerStats.name)
      .toString("ascii")
      .replace(/\0+$/, "");
    const winRate =
      playerStats.gamesPlayed.toNumber() > 0
        ? (
            (playerStats.gamesWon.toNumber() /
              playerStats.gamesPlayed.toNumber()) *
            100
          ).toFixed(1)
        : "0.0";

    console.log(`\n\n\n\n\n\n\n\nWelcome back, ${name}!`);
    console.log("Wallet:", playerKeypair.publicKey.toString());
    console.log("Account:", playerStatsPda.toString());
    console.log("Games played so far:", playerStats.gamesPlayed.toNumber());
    console.log("Games won:", playerStats.gamesWon.toNumber());
    console.log("Win rate:", winRate + "%");
    console.log("Current streak:", playerStats.currentStreak.toNumber());
  }

  console.log("\n\n\n\n\n\n        💥 ROCK PAPER SCISSORS 💥");
  console.log(
    "\n\n",
    " 👊 1           ✋ 2            ✌️  3\n",
    " Rock           Paper         Scissors\n",
    "🗿🗿🗿         🧻 🧻 🧻       ✂️  ✂️  ✂️"
  );

  const move = await question(
    "\n\nEnter your move and try to beat the machine: "
  );

  // Bulletproof input handling
  const cleanInput = move.trim().charAt(0);
  const playerMove = parseInt(cleanInput);

  if (isNaN(playerMove) || playerMove < 1 || playerMove > 3) {
    console.log("Invalid move. Please enter 1, 2, or 3.");
    rl.close();
    return true; // Continue game
  }

  console.log(`\n\n\n\n\n\nPlaying move: ${playerMove}...`);

  try {
    // Get player stats BEFORE the transaction to get the previous streak
    let previousStreak = 0;
    try {
      const previousPlayerStats = await program.account.playerStats.fetch(
        playerStatsPda
      );
      previousStreak = previousPlayerStats.currentStreak.toNumber();
    } catch (error) {
      // New player or error, streak starts at 0
      previousStreak = 0;
    }

    // Use player wallet for the transaction
    const tx = await program.methods
      .playGame(playerMove, isNewPlayer ? playerNameBytes : null)
      .rpc();

    // Get transaction logs to extract machine move and result
    const txInfo = await program.provider.connection.getTransaction(tx, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });

    let machineMove = 0;
    let result = "";

    if (txInfo && txInfo.meta && txInfo.meta.logMessages) {
      const logs = txInfo.meta.logMessages;
      for (const log of logs) {
        if (log.includes("Machine played:")) {
          const moveName = log.split("Machine played: ")[1];
          if (moveName === "Rock") machineMove = 1;
          else if (moveName === "Paper") machineMove = 2;
          else if (moveName === "Scissors") machineMove = 3;
        } else if (log.includes("Result:")) {
          const resultStr = log.split("Result: ")[1];
          if (resultStr === "Win") result = "win";
          else if (resultStr === "Lose") result = "lose";
          else if (resultStr === "Tie") result = "tie";
        }
      }
    }

    // Fallback: if we couldn't parse logs, use client-side calculation
    if (machineMove === 0 || result === "") {
      console.log(
        "Warning: Could not parse transaction logs, using fallback calculation"
      );
      const blockTime = Math.floor(Date.now() / 1000);
      machineMove = (blockTime % 3) + 1;

      if (playerMove === machineMove) {
        result = "tie";
      } else if (
        (playerMove === 1 && machineMove === 3) ||
        (playerMove === 2 && machineMove === 1) ||
        (playerMove === 3 && machineMove === 2)
      ) {
        result = "win";
      } else {
        result = "lose";
      }
    }

    // Get updated player stats
    try {
      playerStats = await program.account.playerStats.fetch(playerStatsPda);
    } catch (error) {
      console.log("Error fetching player stats:", error);
      playerStats = null; // Default to null if we can't fetch
    }

    // Show game results with frame
    const moveNames = ["", "👊 Rock 👊", "✋ Paper ✋", "✌️  Scissors ✌️"];
    console.log(`\n🎯 ======== GAME RESULTS ======== 🎯`);

    console.log(`\nYour move:     ${moveNames[playerMove]}`);
    console.log(`\nMachine move:  ${moveNames[machineMove]}\n`);

    let winner = "";
    let victoryEmojis = "";
    if (result === "win") {
      // Victory emoji patterns with fist, mountain, happy emojis + random party emojis
      const happyEmojis = "🎉 🎊 🎈 ✨ 💫 ⭐ 🔥 ";

      switch (playerMove) {
        case 1: // Rock
          victoryEmojis = happyEmojis.repeat(2) + "👊 🗿 ".repeat(6);
          break;
        case 2: // Paper
          victoryEmojis = happyEmojis.repeat(2) + "✋ 🧻 ".repeat(6);
          break;
        case 3: // Scissors
          victoryEmojis = happyEmojis.repeat(2) + "✌️  ✂️  ".repeat(6);
          break;
      }
      winner = "You win! 🎉 " + victoryEmojis;
    } else if (result === "lose") {
      // Loss emoji patterns with open hand, paper, sad emojis + random sad emojis
      const sadEmojis = "😵 💔 😭 😰 😱 💀 ☠️  ";

      switch (playerMove) {
        case 1: // Rock
          victoryEmojis = sadEmojis.repeat(2) + "👊 🗿 ".repeat(6);
          break;
        case 2: // Paper
          victoryEmojis = sadEmojis.repeat(2) + "✋ 🧻 ".repeat(6);
          break;
        case 3: // Scissors
          victoryEmojis = sadEmojis.repeat(2) + "✌️  ✂️  ".repeat(6);
          break;
      }
      winner = "You lose! 😭 " + victoryEmojis;
    } else if (result === "tie") {
      winner =
        "It's a tie! 🤝 🤝 🤝 🤝 🤝 🤝 🤝 🤝 🤝 🤝 🤝 🤝 🤝 🤝 🤝 🤝 🤝 🤝 🤝 🤝 🤝 🤝 🤝 🤝 🤝 ";
    }
    console.log(`               ${winner}`);

    // Show correct number of explosions based on streak
    let newStreak = previousStreak;
    if (result === "win") {
      newStreak = newStreak + 1;
    } else if (result === "lose") {
      newStreak = 0;
    } // tie: streak remains the same
    const streakEmojis = "💥".repeat(newStreak);
    console.log(`\nMatch counter: ${newStreak} ${streakEmojis}`);

    console.log(`Transaction:   ${tx}`);

    console.log(`\n🎯 ================================ 🎯`);

    rl.close();
    return await showPostGameMenu(gameContext);
  } catch (error) {
    console.error("Error playing game:", error);
    rl.close();
    return true; // Continue game
  }
}

async function showPostGameMenu(gameContext: any) {
  const {
    program,
    connection,
    provider,
    playerKeypair,
    gameStatePda,
    playerStatsPda,
  } = gameContext;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (query: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(query, resolve);
    });
  };

  // Simple post-game prompt with emojis
  console.log(
    `\nNew Game?      💥 Yes - press return or  👊  1   ✋  2   ✌️  3`
  );
  console.log(`               📊 Stats - press s`);
  console.log(`               ❌ Quit - press q`);
  const choice = await question("");

  // Bulletproof input handling
  const cleanChoice = choice.trim().charAt(0).toLowerCase();

  if (cleanChoice === "q") {
    console.log("Thanks for playing! 👋");
    rl.close();
    return false; // Exit game
  } else if (cleanChoice === "s") {
    // Show comprehensive stats
    console.log(`\n\n\n\n\n\n📊 ======== GAME STATISTICS ======== 📊`);

    // Global stats
    try {
      const gameState = await program.account.gameState.fetch(gameStatePda);
      console.log(`\n🌍 Global Stats:`);
      console.log(`Total games played: ${gameState.totalGames} 🎮`);
      console.log(`Total wins: ${gameState.totalWins} 🏅`);
      console.log(`Total players: ${gameState.totalPlayers} 👥`);
      console.log(
        `Global win rate: ${
          gameState.totalGames.toNumber() > 0
            ? (
                (gameState.totalWins.toNumber() /
                  gameState.totalGames.toNumber()) *
                100
              ).toFixed(1)
            : 0
        }% 📈`
      );
    } catch (error) {
      console.log("Could not fetch global stats.");
    }

    console.log(``);

    // Player stats
    try {
      // Always fetch player stats for stats display
      const stats = await program.account.playerStats.fetch(playerStatsPda);
      const name = Buffer.from(stats.name)
        .toString("ascii")
        .replace(/\0+$/, "");
      console.log(`🎯 Your Stats:`);
      console.log(`Name: ${name}`);
      console.log(`Games played: ${stats.gamesPlayed} 🎮`);
      console.log(`Games won: ${stats.gamesWon} 🏅`);
      console.log(`Current streak: ${stats.currentStreak} ⭐`);
      console.log(`Highest streak: ${stats.highestStreak} 🔥`);
      console.log(
        `Win rate: ${
          stats.gamesPlayed.toNumber() > 0
            ? (
                (stats.gamesWon.toNumber() / stats.gamesPlayed.toNumber()) *
                100
              ).toFixed(1)
            : 0
        }% 📈`
      );
      // Calculate average match length (placeholder, can be improved)
      const avgMatchLength =
        stats.gamesPlayed.toNumber() > 0
          ? (
              stats.gamesPlayed.toNumber() / stats.gamesPlayed.toNumber()
            ).toFixed(1)
          : "0.0";
      console.log(`Avg match length: ${avgMatchLength} games`);

      console.log(`\n🏅 Achievements:`);
      if (stats.highestStreak.toNumber() >= 3) {
        console.log("✅ 3-win streak achieved!");
      }
      if (stats.highestStreak.toNumber() >= 5) {
        console.log("✅ 5-win streak achieved!");
      }
      if (stats.highestStreak.toNumber() >= 10) {
        console.log("✅ 10-win streak achieved!");
      }
      if (stats.gamesPlayed.toNumber() >= 10) {
        console.log("✅ Veteran player (10+ games)!");
      }
      if (stats.gamesPlayed.toNumber() >= 50) {
        console.log("✅ Master player (50+ games)!");
      }
      // Leaderboard
      const { topWinners, topWinRate, topStreaks } = await getLeaderboard(
        program
      );
      console.log(`\nLeaderboard:`);
      if (topWinners.length > 0) {
        console.log(`🥇 Top 5 by Games Won:`);
        topWinners.forEach((p, i) => {
          const pubkey = p.account.player.toString();
          const short = pubkey.slice(0, 4) + "..." + pubkey.slice(-4);
          const name = Buffer.from(p.account.name)
            .toString("ascii")
            .replace(/\0+$/, "");
          const medal = i === 0 ? "👑" : i === 1 ? "🥈" : i === 2 ? "🥉" : "  ";
          console.log(
            `${medal} ${short} - ${p.account.gamesWon.toNumber()} wins - ${p.account.gamesPlayed.toNumber()} games - ${
              name || "Unknown"
            }`
          );
        });
      } else {
        console.log("No players yet.");
      }
      if (topWinRate.length > 0) {
        console.log(`\n📈 Top 5 by Win Rate (min 5 games):`);
        topWinRate.forEach((p, i) => {
          const pubkey = p.account.player.toString();
          const short = pubkey.slice(0, 4) + "..." + pubkey.slice(-4);
          const name = Buffer.from(p.account.name)
            .toString("ascii")
            .replace(/\0+$/, "");
          const rate = (
            (p.account.gamesWon.toNumber() / p.account.gamesPlayed.toNumber()) *
            100
          ).toFixed(1);
          const medal = i === 0 ? "👑" : i === 1 ? "🥈" : i === 2 ? "🥉" : "  ";
          console.log(
            `${medal} ${short} - ${rate}% - ${p.account.gamesWon.toNumber()}/${p.account.gamesPlayed.toNumber()} - ${
              name || "Unknown"
            }`
          );
        });
      }
      if (topStreaks.length > 0) {
        console.log(`\n🔥 Fire Streaks 🔥:`);
        topStreaks.forEach((p, i) => {
          const pubkey = p.account.player.toString();
          const short = pubkey.slice(0, 4) + "..." + pubkey.slice(-4);
          const name = Buffer.from(p.account.name)
            .toString("ascii")
            .replace(/\0+$/, "");
          const medal = i === 0 ? "👑" : i === 1 ? "🥈" : i === 2 ? "🥉" : "  ";
          console.log(
            `${medal} ${short} - ${p.account.highestStreak.toNumber()} streaks 🔥 - ${
              name || "Unknown"
            }`
          );
        });
      }
    } catch (error) {
      console.log("Could not fetch player stats.");
    }

    console.log(`\n📊 ================================ 📊`);
    console.log(`\nPress return to continue`);
    await question("");
    rl.close();
    return true; // Continue game
  } else if (cleanChoice === "y" || cleanChoice === "" || cleanChoice === " ") {
    // Continue game (default to yes if just Enter or any invalid input)
    rl.close();
    return true; // Continue game
  } else if (
    cleanChoice === "1" ||
    cleanChoice === "2" ||
    cleanChoice === "3"
  ) {
    // Player chose a move, play immediately
    const immediateMove = parseInt(cleanChoice);
    console.log(`\n\n\n\n\n\nPlaying move: ${immediateMove}...`);

    let isNewPlayer = false;
    let playerStats;
    try {
      playerStats = await program.account.playerStats.fetch(playerStatsPda);
      isNewPlayer =
        playerStats.player.toString() ===
        anchor.web3.PublicKey.default.toString();
    } catch (e) {
      isNewPlayer = true;
    }

    let playerNameBytes: number[] | undefined = undefined;
    let playerName: string | undefined = undefined;
    if (isNewPlayer) {
      console.log(
        "\nWelcome, new player! Your wallet:",
        playerKeypair.publicKey.toString()
      );
      playerName = await promptForName(rl);
      // Validate name: ASCII, max 8 chars, non-empty
      if (
        !playerName ||
        playerName.length === 0 ||
        playerName.length > 8 ||
        /[^\x20-\x7E]/.test(playerName)
      ) {
        console.log("Invalid name. Must be 1-8 ASCII characters.");
        rl.close();
        return true;
      }
      playerNameBytes = encodeName(playerName);
    }

    try {
      // Get player stats BEFORE the transaction to get the previous streak
      let previousStreak = 0;
      try {
        const previousPlayerStats = await program.account.playerStats.fetch(
          playerStatsPda
        );
        previousStreak = previousPlayerStats.currentStreak.toNumber();
      } catch (error) {
        // New player or error, streak starts at 0
        previousStreak = 0;
      }

      // Play the game immediately with the chosen move
      const tx = await program.methods
        .playGame(immediateMove, isNewPlayer ? playerNameBytes : null)
        .rpc();

      // Get transaction logs to extract machine move and result
      const txInfo = await program.provider.connection.getTransaction(tx, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });

      let machineMoveImmediate = 0;
      let resultImmediate = "";

      if (txInfo && txInfo.meta && txInfo.meta.logMessages) {
        const logs = txInfo.meta.logMessages;
        for (const log of logs) {
          if (log.includes("Machine played:")) {
            const moveName = log.split("Machine played: ")[1];
            if (moveName === "Rock") machineMoveImmediate = 1;
            else if (moveName === "Paper") machineMoveImmediate = 2;
            else if (moveName === "Scissors") machineMoveImmediate = 3;
          } else if (log.includes("Result:")) {
            const resultStr = log.split("Result: ")[1];
            if (resultStr === "Win") resultImmediate = "win";
            else if (resultStr === "Lose") resultImmediate = "lose";
            else if (resultStr === "Tie") resultImmediate = "tie";
          }
        }
      }

      // Fallback: if we couldn't parse logs, use client-side calculation
      if (machineMoveImmediate === 0 || resultImmediate === "") {
        console.log(
          "Warning: Could not parse transaction logs, using fallback calculation"
        );
        const blockTime = Math.floor(Date.now() / 1000);
        machineMoveImmediate = (blockTime % 3) + 1;

        if (immediateMove === machineMoveImmediate) {
          resultImmediate = "tie";
        } else if (
          (immediateMove === 1 && machineMoveImmediate === 3) ||
          (immediateMove === 2 && machineMoveImmediate === 1) ||
          (immediateMove === 3 && machineMoveImmediate === 2)
        ) {
          resultImmediate = "win";
        } else {
          resultImmediate = "lose";
        }
      }

      // Get updated player stats
      try {
        playerStats = await program.account.playerStats.fetch(playerStatsPda);
      } catch (error) {
        console.log("Error fetching player stats:", error);
        playerStats = null;
      }

      // Show game results
      const moveNames = ["", "👊 Rock 👊", "✋ Paper ✋", "✌️  Scissors ✌️"];
      console.log(`\n🎯 ======== GAME RESULTS ======== 🎯`);
      console.log(`\nYour move:     ${moveNames[immediateMove]}`);
      console.log(`\nMachine move:  ${moveNames[machineMoveImmediate]}\n`);

      let winner = "";
      let victoryEmojis = "";
      if (resultImmediate === "win") {
        const happyEmojis = "🎉 🎊 🎈 ✨ 💫 ⭐ 🔥 ";
        switch (immediateMove) {
          case 1:
            victoryEmojis = happyEmojis.repeat(2) + "👊 🗿 ".repeat(6);
            break;
          case 2:
            victoryEmojis = happyEmojis.repeat(2) + "✋ 🧻 ".repeat(6);
            break;
          case 3:
            victoryEmojis = happyEmojis.repeat(2) + "✌️  ✂️  ".repeat(6);
            break;
        }
        winner = "You win! 🎉 " + victoryEmojis;
      } else if (resultImmediate === "lose") {
        const sadEmojis = "😵 💔 😭 😰 😱 💀 ☠️  ";
        switch (immediateMove) {
          case 1:
            victoryEmojis = sadEmojis.repeat(2) + "👊 🗿 ".repeat(6);
            break;
          case 2:
            victoryEmojis = sadEmojis.repeat(2) + "✋ 🧻 ".repeat(6);
            break;
          case 3:
            victoryEmojis = sadEmojis.repeat(2) + "✌️  ✂️  ".repeat(6);
            break;
        }
        winner = "You lose! 😭 " + victoryEmojis;
      } else if (resultImmediate === "tie") {
        winner =
          "It's a tie! 🤝 🤝 🤝 🤝 🤝 🤝 🤝 🤝 🤝 🤝 🤝 🤝 🤝 🤝 🤝 🤝 🤝 🤝 🤝 🤝 🤝 🤝 🤝 🤝 🤝 ";
      }
      console.log(`               ${winner}`);

      let newStreak = previousStreak;
      if (resultImmediate === "win") {
        newStreak = newStreak + 1;
      } else if (resultImmediate === "lose") {
        newStreak = 0;
      } // tie: streak remains the same
      const streakEmojis = "💥".repeat(newStreak);
      console.log(`\nMatch counter: ${newStreak} ${streakEmojis}`);
      console.log(`Transaction:   ${tx}`);
      console.log(`\n🎯 ================================ 🎯`);

      // Go back to post-game menu instead of main menu
      rl.close();
      return await showPostGameMenu(gameContext); // Recursive call to show post-game menu
    } catch (error) {
      console.error("Error playing immediate game:", error);
      rl.close();
      return true; // Continue game
    }
  } else {
    // Any other input, continue game
    rl.close();
    return true; // Continue game
  }
}

async function playGameLoop(gameContext: any) {
  return await showMainUI(gameContext);
}

async function playGame() {
  // Initialize game once
  const gameContext = await initializeGame();
  if (!gameContext) {
    return;
  }

  // Game loop
  let continueGame = true;
  while (continueGame) {
    continueGame = await playGameLoop(gameContext);
  }
}

async function main() {
  await playGame();
}

main().catch(console.error);
