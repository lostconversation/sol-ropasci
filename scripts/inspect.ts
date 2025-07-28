import * as anchor from "@coral-xyz/anchor";
import * as fs from "fs";
import * as path from "path";

async function main() {
  // Load config
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

  console.log("🔍 INSPECTING ALL PROGRAM ACCOUNTS");
  console.log("==================================");
  console.log("Program ID:", program.programId.toString());

  // Get all program accounts
  const accounts = await connection.getProgramAccounts(program.programId);
  console.log(`\nFound ${accounts.length} total program accounts`);

  let gameStateCount = 0;
  let playerStatsCount = 0;
  let unknownCount = 0;

  for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i];
    console.log(`\n--- Account ${i + 1} ---`);
    console.log("Account:", account.pubkey.toString());
    console.log("Size:", account.account.data.length, "bytes");

    // Try to identify account type by size and content
    try {
      // Try to deserialize as game_state
      try {
        const gameState = await program.account.gameState.fetch(account.pubkey);
        console.log("✅ Type: game_state");
        console.log("  - Total games:", gameState.totalGames.toNumber());
        console.log("  - Total wins:", gameState.totalWins.toNumber());
        console.log("  - Total players:", gameState.totalPlayers.toNumber());
        console.log("  - Bump:", gameState.bump);

        // Calculate global win rate
        const globalWinRate =
          gameState.totalGames.toNumber() > 0
            ? (
                (gameState.totalWins.toNumber() /
                  gameState.totalGames.toNumber()) *
                100
              ).toFixed(1)
            : "0.0";
        console.log("  - Global win rate:", globalWinRate + "%");

        gameStateCount++;
        continue;
      } catch (e) {
        // Not a game_state
      }

      // Try to deserialize as player_stats
      try {
        const playerStats = await program.account.playerStats.fetch(
          account.pubkey
        );
        console.log("✅ Type: player_stats");
        console.log("  - Player:", playerStats.player.toString());
        const name = Buffer.from(playerStats.name)
          .toString("ascii")
          .replace(/\0+$/, "");
        console.log("  - Name:", name || "(empty)");
        console.log("  - Games played:", playerStats.gamesPlayed.toNumber());
        console.log("  - Games won:", playerStats.gamesWon.toNumber());
        console.log(
          "  - Current streak:",
          playerStats.currentStreak.toNumber()
        );
        console.log(
          "  - Highest streak:",
          playerStats.highestStreak.toNumber()
        );
        console.log("  - Bump:", playerStats.bump);

        // Calculate win rate
        const winRate =
          playerStats.gamesPlayed.toNumber() > 0
            ? (
                (playerStats.gamesWon.toNumber() /
                  playerStats.gamesPlayed.toNumber()) *
                100
              ).toFixed(1)
            : "0.0";
        console.log("  - Win rate:", winRate + "%");

        // Show achievements
        const achievements = [];
        if (playerStats.highestStreak.toNumber() >= 3)
          achievements.push("3-win streak");
        if (playerStats.highestStreak.toNumber() >= 5)
          achievements.push("5-win streak");
        if (playerStats.highestStreak.toNumber() >= 10)
          achievements.push("10-win streak");
        if (playerStats.gamesPlayed.toNumber() >= 10)
          achievements.push("Veteran (10+ games)");
        if (playerStats.gamesPlayed.toNumber() >= 50)
          achievements.push("Master (50+ games)");

        if (achievements.length > 0) {
          console.log("  - Achievements:", achievements.join(", "));
        }

        playerStatsCount++;
        continue;
      } catch (e) {
        // Not a player_stats
      }

      // If we get here, it's an unknown account type
      console.log("❌ Type: Unknown (failed all deserialization attempts)");
      unknownCount++;
    } catch (e: any) {
      console.log("❌ Type: Unknown (general error)");
      console.log("  - Error:", e.message);
      unknownCount++;
    }
  }

  console.log(`\n📊 SUMMARY:`);
  console.log(`game_state accounts: ${gameStateCount}`);
  console.log(`player_stats accounts: ${playerStatsCount}`);
  console.log(`unknown accounts: ${unknownCount}`);
  console.log(`Total: ${accounts.length}`);

  if (unknownCount > 0) {
    console.log(`\n💡 The ${unknownCount} unknown accounts are likely:`);
    console.log(`   - Old accounts from previous program versions`);
    console.log(`   - Accounts with corrupted data`);
    console.log(`   - Accounts from different program structures`);
  }
}

main().catch(console.error);
