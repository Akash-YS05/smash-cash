import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { TapToWin } from "../target/types/tap_to_win";
import { expect } from "chai";

describe("tap_to_win", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.TapToWin as Program<TapToWin>;

  let gameStatePDA: anchor.web3.PublicKey;
  let gameStateBump: number;
  let playerPDA: anchor.web3.PublicKey;
  let playerBump: number;

  before(async () => {
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
      try {
        await program.account.gameState.fetch(gameStatePDA);
        console.log("Game state already exists, skipping initialization");
        return;
      } catch {}

      const tx = await program.methods
        .initialize()
        .accounts({
          gameState: gameStatePDA,
          authority: provider.wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc({ commitment: "confirmed" });

      console.log("Initialize transaction signature:", tx);

      await provider.connection.confirmTransaction(tx, "confirmed");

      const gameState = await program.account.gameState.fetch(gameStatePDA);
      expect(gameState.authority.toString()).to.equal(provider.wallet.publicKey.toString());
      expect(gameState.totalPlayers.toNumber()).to.equal(0);
      expect(gameState.totalGames.toNumber()).to.equal(0);
      expect(gameState.topScore.toNumber()).to.equal(0);
    } catch (error) {
      console.error("Error initializing game state:", error);
      throw error;
    }
  });

  it("Create player", async () => {
    try {
      try {
        await program.account.player.fetch(playerPDA);
        console.log("Player already exists, skipping creation");
        return;
      } catch {}

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

      await provider.connection.confirmTransaction(tx, "confirmed");

      const player = await program.account.player.fetch(playerPDA);
      expect(player.wallet.toString()).to.equal(provider.wallet.publicKey.toString());
      expect(player.highScore.toNumber()).to.equal(0);
      expect(player.totalGames.toNumber()).to.equal(0);

      const gameState = await program.account.gameState.fetch(gameStatePDA);
      expect(gameState.totalPlayers.toNumber()).to.equal(1);
    } catch (error) {
      console.error("Error creating player:", error);
      console.error("Error details:", error.logs);
      throw error;
    }
  });

  it("Submit score", async () => {
    const testScore = 150;

    try {
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

      await provider.connection.confirmTransaction(tx, "confirmed");

      const updatedPlayer = await program.account.player.fetch(playerPDA);
      expect(updatedPlayer.highScore.toNumber()).to.equal(testScore);
      expect(updatedPlayer.totalGames.toNumber()).to.equal(1);

      const gameState = await program.account.gameState.fetch(gameStatePDA);
      expect(gameState.totalGames.toNumber()).to.equal(1);
      expect(gameState.topScore.toNumber()).to.equal(testScore);
      expect(gameState.topPlayer.toString()).to.equal(provider.wallet.publicKey.toString());
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

      await provider.connection.confirmTransaction(tx, "confirmed");

      const player = await program.account.player.fetch(playerPDA);
      expect(player.highScore.toNumber()).to.equal(higherScore);
      expect(player.totalGames.toNumber()).to.equal(2);

      const gameState = await program.account.gameState.fetch(gameStatePDA);
      expect(gameState.totalGames.toNumber()).to.equal(2);
      expect(gameState.topScore.toNumber()).to.equal(higherScore);
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
    } catch (error) {
      console.error("Error getting leaderboard info:", error);
      throw error;
    }
  });

  it("Reject invalid score", async () => {
    try {
      await program.methods
        .submitScore(new anchor.BN(0))
        .accounts({
          player: playerPDA,
          gameState: gameStatePDA,
          authority: provider.wallet.publicKey,
        })
        .rpc({ commitment: "confirmed" });

      expect.fail("Should have rejected invalid score");
    } catch (error) {
      const errorMessage = error.message || error.toString();
      if (
        errorMessage.includes("Score must be greater than 0") ||
        errorMessage.includes("InvalidScore") ||
        error.code === 6000
      ) {
        console.log("Invalid score rejected as expected");
      } else {
        console.error("Unexpected error:", errorMessage);
        throw error;
      }
    }
  });
});
