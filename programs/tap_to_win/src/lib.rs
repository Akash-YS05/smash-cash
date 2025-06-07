use anchor_lang::prelude::*;

declare_id!("CTvpChrJqAhxAPQPMU2pJk8RcnzLwTJ5s7BJHftzS7vZ");

#[program]
pub mod tap_to_win {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let game_state = &mut ctx.accounts.game_state;
        game_state.authority = ctx.accounts.authority.key();
        game_state.total_players = 0;
        game_state.total_games = 0;
        game_state.top_score = 0;
        game_state.top_player = None;
        game_state.bump = ctx.bumps.game_state;
    
        msg!("Game state initialized.");
        Ok(())
    }
    
    pub fn create_player(ctx: Context<CreatePlayer>) -> Result<()> {
        let player = &mut ctx.accounts.player;
        let game_state = &mut ctx.accounts.game_state;
    
        player.wallet = ctx.accounts.authority.key();
        player.high_score = 0;
        player.total_games = 0;
        player.last_played = Clock::get()?.unix_timestamp;
        player.bump = ctx.bumps.player;
    
        game_state.total_players += 1;
        
        msg!("Player created: {}", player.wallet);
        Ok(())
    }

    pub fn submit_score(ctx: Context<SubmitScore>, score: u64) -> Result<()> {
        let player = &mut ctx.accounts.player;
        let game_state = &mut ctx.accounts.game_state;

        require!(score > 0, GameError::InvalidScore);

        if score > player.high_score {
            player.high_score = score;
            msg!("New high score for player {}: {}", player.wallet, score);
        }

        player.total_games += 1;
        player.last_played = Clock::get()?.unix_timestamp;

        game_state.total_games += 1;
        if score > game_state.top_score {
            game_state.top_score = score;
            game_state.top_player = Some(player.wallet);
        }

        msg!("Score submitted for player {}: {}", player.wallet, score);
        Ok(())
    }

    pub fn get_leaderboard_info(ctx: Context<GetLeaderboardInfo>) -> Result<()> {
        let game_state = &ctx.accounts.game_state;

        msg!("Total Players: {}, Total Games: {}, Top Score: {}, Top Player: {:?}", 
            game_state.total_players, 
            game_state.total_games, 
            game_state.top_score, 
            game_state.top_player);

        if let Some(top_player) = game_state.top_player {
            msg!("Top Player: {}", top_player);
        }

        Ok(())
    }
    
}

#[account]
pub struct GameState {
    pub authority: Pubkey,
    pub total_players: u64,
    pub total_games: u64,
    pub top_score: u64,
    pub top_player: Option<Pubkey>,
    pub bump: u8
}

#[account]
pub struct Player {
    pub wallet: Pubkey,
    pub total_games: u64,
    pub high_score: u64,
    pub last_played: i64,
    pub bump: u8
}
//32,8,8,1,8

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + 90,
        seeds = [b"game_state"],
        bump
    )]

    pub game_state: Account<'info, GameState>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>
}

#[derive(Accounts)]
pub struct CreatePlayer<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + 57,
        seeds = [b"player", authority.key().as_ref()],
        bump
    )]

    pub player: Account<'info, Player>,

    #[account(
        mut,
        seeds = [b"game_state"],
        bump = game_state.bump
    )]
    pub game_state: Account<'info, GameState>,


    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}


#[derive(Accounts)]
pub struct SubmitScore<'info> {
    #[account(
        mut,
        seeds = [b"player", authority.key().as_ref()],
        bump = player.bump
    )]

    pub player: Account<'info, Player>,

    #[account(
        mut,
        seeds= [b"game_state"],
        bump = game_state.bump
    )]

    pub game_state: Account<'info, GameState>,

    pub authority: Signer<'info>
    
}

#[derive(Accounts)]
pub struct GetLeaderboardInfo<'info> {
    #[account(
        seeds = [b"game_state"],
        bump = game_state.bump
    )]

    pub game_state: Account<'info, GameState>,
}

#[error_code] 
pub enum GameError {
    #[msg("Score must be greater than 0.")]
    InvalidScore
}