// tests/tap_to_win.ts

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { TapToWin } from "../target/types/tap_to_win";
import { expect } from "chai";

describe("tap_to_win", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.TapToWin as Program<TapToWin>;

  let gameStatePDA: anchor.web3.PublicKey;
  let gameStateBump: number;
  let playerPDA: anchor.web3.PublicKey;
  let playerBump: number;

  before(async () => {
    // Derive PDAs
    [gameStatePDA, gameStateBump] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("game_state")],
      program.programId
    );

    [playerPDA, playerBump] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("player"), provider.wallet.publicKey.toBuffer()],
      program.programId
    );

    console.log("Game State PDA:", gameStatePDA.toString());
    console.log("Player PDA:", playerPDA.toString());
    console.log("Authority:", provider.wallet.publicKey.toString());
  });

  it("Initialize game state", async () => {
    try {
      // Check if game state already exists
      try {
        await program.account.gameState.fetch(gameStatePDA);
        console.log("Game state already exists, skipping initialization");
        return;
      } catch (error) {
        // Game state doesn't exist, proceed with initialization
      }

      const tx = await program.methods
        .initialize()
        .accounts({
          gameState: gameStatePDA,
          authority: provider.wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc({ commitment: "confirmed" });

      console.log("Initialize transaction signature:", tx);

      // Wait for confirmation
      await provider.connection.confirmTransaction(tx, "confirmed");

      // Verify game state was created
      const gameState = await program.account.gameState.fetch(gameStatePDA);
      expect(gameState.authority.toString()).to.equal(provider.wallet.publicKey.toString());
      expect(gameState.totalPlayers.toNumber()).to.equal(0);
      expect(gameState.totalGames.toNumber()).to.equal(0);
      expect(gameState.topScore.toNumber()).to.equal(0);
      
      console.log("✅ Game state initialized successfully");
    } catch (error) {
      console.error("Error initializing game state:", error);
      throw error;
    }
  });

  it("Create player", async () => {
    try {
      // Check if player already exists
      try {
        await program.account.player.fetch(playerPDA);
        console.log("Player already exists, skipping creation");
        return;
      } catch (error) {
        // Player doesn't exist, proceed with creation
      }

      const tx = await program.methods
        .createPlayer()
        .accounts({
          player: playerPDA,
          gameState: gameStatePDA,
          authority: provider.wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc({ commitment: "confirmed" });

      console.log("Create player transaction signature:", tx);

      // Wait for confirmation
      await provider.connection.confirmTransaction(tx, "confirmed");

      // Verify player was created
      const player = await program.account.player.fetch(playerPDA);
      expect(player.wallet.toString()).to.equal(provider.wallet.publicKey.toString());
      expect(player.highScore.toNumber()).to.equal(0);
      expect(player.totalGames.toNumber()).to.equal(0);

      // Verify game state was updated
      const gameState = await program.account.gameState.fetch(gameStatePDA);
      expect(gameState.totalPlayers.toNumber()).to.equal(1);
      
      console.log("✅ Player created successfully");
    } catch (error) {
      console.error("Error creating player:", error);
      console.error("Error details:", error.logs);
      throw error;
    }
  });

  it("Submit score", async () => {
    const testScore = 150;
    
    try {
      // Ensure player exists
      const player = await program.account.player.fetch(playerPDA);
      console.log("Player exists:", player.wallet.toString());

      const tx = await program.methods
        .submitScore(new anchor.BN(testScore))
        .accounts({
          player: playerPDA,
          gameState: gameStatePDA,
          authority: provider.wallet.publicKey,
        })
        .rpc({ commitment: "confirmed" });

      console.log("Submit score transaction signature:", tx);

      // Wait for confirmation
      await provider.connection.confirmTransaction(tx, "confirmed");

      // Verify player stats were updated
      const updatedPlayer = await program.account.player.fetch(playerPDA);
      expect(updatedPlayer.highScore.toNumber()).to.equal(testScore);
      expect(updatedPlayer.totalGames.toNumber()).to.equal(1);

      // Verify game state was updated
      const gameState = await program.account.gameState.fetch(gameStatePDA);
      expect(gameState.totalGames.toNumber()).to.equal(1);
      expect(gameState.topScore.toNumber()).to.equal(testScore);
      expect(gameState.topPlayer.toString()).to.equal(provider.wallet.publicKey.toString());
      
      console.log("✅ Score submitted successfully");
    } catch (error) {
      console.error("Error submitting score:", error);
      console.error("Error details:", error.logs);
      throw error;
    }
  });

  it("Submit higher score", async () => {
    const higherScore = 300;
    
    try {
      const tx = await program.methods
        .submitScore(new anchor.BN(higherScore))
        .accounts({
          player: playerPDA,
          gameState: gameStatePDA,
          authority: provider.wallet.publicKey,
        })
        .rpc({ commitment: "confirmed" });

      console.log("Submit higher score transaction signature:", tx);

      // Wait for confirmation
      await provider.connection.confirmTransaction(tx, "confirmed");

      // Verify player high score was updated
      const player = await program.account.player.fetch(playerPDA);
      expect(player.highScore.toNumber()).to.equal(higherScore);
      expect(player.totalGames.toNumber()).to.equal(2);

      // Verify game state reflects new top score
      const gameState = await program.account.gameState.fetch(gameStatePDA);
      expect(gameState.totalGames.toNumber()).to.equal(2);
      expect(gameState.topScore.toNumber()).to.equal(higherScore);
      
      console.log("✅ Higher score submitted successfully");
    } catch (error) {
      console.error("Error submitting higher score:", error);
      console.error("Error details:", error.logs);
      throw error;
    }
  });

  it("Get leaderboard info", async () => {
    try {
      const tx = await program.methods
        .getLeaderboardInfo()
        .accounts({
          gameState: gameStatePDA,
        })
        .rpc({ commitment: "confirmed" });

      console.log("Get leaderboard info transaction signature:", tx);
      console.log("✅ Leaderboard info retrieved successfully");
    } catch (error) {
      console.error("Error getting leaderboard info:", error);
      throw error;
    }
  });

  it("Reject invalid score", async () => {
    try {
      await program.methods
        .submitScore(new anchor.BN(0)) // Invalid score (0)
        .accounts({
          player: playerPDA,
          gameState: gameStatePDA,
          authority: provider.wallet.publicKey,
        })
        .rpc({ commitment: "confirmed" });
      
      // Should not reach here
      expect.fail("Should have rejected invalid score");
    } catch (error) {
      // Check for the custom error message or anchor error
      const errorMessage = error.message || error.toString();
      if (errorMessage.includes("Score must be greater than 0") || 
          errorMessage.includes("InvalidScore") ||
          error.code === 6000) { // Assuming custom error code
        console.log("✅ Invalid score rejected as expected");
      } else {
        console.error("Unexpected error:", errorMessage);
        throw error;
      }
    }
  });
});