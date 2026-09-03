import { GameRegistryService } from './game-registry.service';
import { IGameDefinition } from '../interfaces/game-definition.interface';

describe('GameRegistryService', () => {
  let service: GameRegistryService;

  beforeEach(() => {
    service = new GameRegistryService();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should register and retrieve a game definition', () => {
    const mockGame: IGameDefinition = {
      gameType: 'mock-game',
      name: 'Mock Game',
      version: '1.0.0',
      init: jest.fn().mockReturnValue({}),
      onAction: jest.fn().mockReturnValue({ newState: {} }),
      getClientState: jest.fn().mockReturnValue({}),
      isFinished: jest.fn().mockReturnValue(false),
      getFinalResults: jest.fn().mockReturnValue([]),
    };

    service.register(mockGame);

    expect(service.has('mock-game')).toBe(true);
    expect(service.get('mock-game')).toBe(mockGame);
    expect(service.list()).toHaveLength(1);
    expect(service.list()[0].gameType).toBe('mock-game');
  });
});
