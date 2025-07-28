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

  console.log("\n\n\n\n\n\n🔍 PLAYER DATA CHECK");
  console.log("=====================");
  console.log("Player wallet:", playerKeypair.publicKey.toString());
  console.log("Program ID:", program.programId.toString());

  // Calculate the player_stats PDA
  const [playerStatsPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("player_stats"), playerKeypair.publicKey.toBuffer()],
    program.programId
  );

  console.log("\n📊 Player Stats Account:");
  console.log("Account:", playerStatsPda.toString());
  console.log(
    "Solscan URL:",
    `https://solscan.io/account/${playerStatsPda.toString()}?cluster=devnet`
  );

  try {
    // Fetch player stats
    const playerStats = await program.account.playerStats.fetch(playerStatsPda);

    console.log("\n🎮 Player Data:");
    console.log("===============");

    // Decode name
    const name = Buffer.from(playerStats.name)
      .toString("ascii")
      .replace(/\0+$/, "");
    console.log("Name:", name || "(not set)");

    console.log("Games played:", playerStats.gamesPlayed.toNumber());
    console.log("Games won:", playerStats.gamesWon.toNumber());
    console.log("Current streak:", playerStats.currentStreak.toNumber());
    console.log("Highest streak:", playerStats.highestStreak.toNumber());

    const winRate =
      playerStats.gamesPlayed.toNumber() > 0
        ? (
            (playerStats.gamesWon.toNumber() /
              playerStats.gamesPlayed.toNumber()) *
            100
          ).toFixed(1)
        : "0.0";
    console.log("Win rate:", winRate + "%");

    console.log("\n🔗 View on Solscan:");
    console.log(
      `https://solscan.io/account/${playerStatsPda.toString()}?cluster=devnet`
    );

    console.log(
      "\n💡 Note: The account data is stored as binary. Solscan may not display it in a readable format, but it's there!"
    );
  } catch (error) {
    console.log("\n❌ Player stats not found.");
    console.log(
      "This means you haven't played any games yet with this wallet."
    );
    console.log("Run 'yarn play' to create your player account!");
  }

  // Also show game_state account
  const [gameStatePda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("game_state")],
    program.programId
  );

  console.log("\n🌍 Global Game State:");
  console.log("Account:", gameStatePda.toString());
  console.log(
    "Solscan URL:",
    `https://solscan.io/account/${gameStatePda.toString()}?cluster=devnet`
  );

  try {
    const gameState = await program.account.gameState.fetch(gameStatePda);
    console.log("Total games:", gameState.totalGames.toNumber());
    console.log("Total wins:", gameState.totalWins.toNumber());
    console.log("Total players:", gameState.totalPlayers.toNumber());
  } catch (error) {
    console.log("Game state not initialized. Run 'yarn init-game' first.");
  }
}

main().catch(console.error);
