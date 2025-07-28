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

  console.log("Player wallet:", playerKeypair.publicKey.toString());

  console.log("Initializing Rock Paper Scissors game...");

  const tx = await program.methods.initializeGame().rpc();
  console.log("Game initialized:", tx);

  // Get the game state PDA
  const [gameStatePda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("game_state")],
    program.programId
  );

  console.log("Game state address:", gameStatePda.toString());
}

main().catch(console.error);
