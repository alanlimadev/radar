import { Injectable, Logger } from '@nestjs/common';
import { IGameDefinition, GameMetadata } from '../interfaces/game-definition.interface';

@Injectable()
export class GameRegistryService {
  private readonly logger = new Logger(GameRegistryService.name);
  private readonly games = new Map<string, IGameDefinition>();

  /**
   * Registra uma nova definição de jogo no framework.
   */
  register(game: IGameDefinition): void {
    if (this.games.has(game.gameType)) {
      this.logger.warn(`Jogo com gameType "${game.gameType}" já estava registrado. Sobrescrevendo...`);
    }
    this.games.set(game.gameType, game);
    this.logger.log(`Jogo registrado com sucesso: ${game.name} (${game.gameType} v${game.version})`);
  }

  /**
   * Obtém a definição de um jogo pelo seu identificador único de tipo.
   */
  get(gameType: string): IGameDefinition | undefined {
    return this.games.get(gameType);
  }

  /**
   * Verifica se um jogo está registrado.
   */
  has(gameType: string): boolean {
    return this.games.has(gameType);
  }

  /**
   * Lista todos os jogos registrados e seus metadados.
   */
  list(): GameMetadata[] {
    return Array.from(this.games.values()).map((game) => ({
      gameType: game.gameType,
      name: game.name,
      description: game.description,
      version: game.version,
      minPlayers: game.minPlayers,
      maxPlayers: game.maxPlayers,
    }));
  }
}
