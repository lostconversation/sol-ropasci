import * as anchor from "@coral-xyz/anchor";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";

async function main() {
  // Load config
  const configPath = path.join(__dirname, "..", "config.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

  // Get player wallet path from config.json
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

  console.log("🔄 PLAYER ACCOUNT RESET");
  console.log("========================");
  console.log("Player wallet:", playerKeypair.publicKey.toString());

  // Calculate the player_stats PDA
  const [playerStatsPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("player_stats"), playerKeypair.publicKey.toBuffer()],
    program.programId
  );

  console.log("Account address:", playerStatsPda.toString());

  try {
    // Check if account exists
    const playerStats = await program.account.playerStats.fetch(playerStatsPda);
    console.log("✅ Account found!");

    // Decode name
    const name = Buffer.from(playerStats.name)
      .toString("ascii")
      .replace(/\0+$/, "");

    console.log("\n👤 PLAYER INFO:");
    console.log("===============");
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
      console.log("Achievements:", achievements.join(", "));
    }

    // Ask for confirmation
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const question = (query: string): Promise<string> => {
      return new Promise((resolve) => {
        rl.question(query, resolve);
      });
    };

    console.log("\n⚠️  WARNING: This will permanently delete your account!");
    console.log("💰 Your rent will be returned to your wallet.");
    console.log("🗑️  All your stats will be lost forever!");
    console.log(
      "✅ Of course you can re-initialize your account by running 'yarn play'"
    );

    const confirm = await question(
      "\nAre you sure you want to reset the account? [Y/n]: "
    );
    const cleanConfirm = confirm.trim().toLowerCase();

    // Default to "yes" if user just hits enter or types "y" or "yes"
    if (cleanConfirm === "" || cleanConfirm === "y" || cleanConfirm === "yes") {
      console.log("\n🗑️  DELETING ACCOUNT...");
      console.log("Calling closePlayerStats...");

      const tx = await program.methods.closePlayerStats().rpc();
      console.log("✅ Account deleted successfully!");
      console.log("Transaction:", tx);
      console.log("💰 Your rent has been returned to your wallet.");
      console.log("🎮 You can now create a new account by running 'yarn play'");
    } else {
      console.log("✅ Account deletion cancelled.");
    }

    rl.close();
  } catch (error) {
    console.log(
      "❌ Player account not found. You haven't played any games yet."
    );
    console.log("Run 'yarn play' to create your player account first!");
  }
}

main().catch(console.error);
