import { RoomManagerService } from './room-manager.service';
import { GameRegistryService } from './game-registry.service';
import { IGameDefinition } from '../interfaces/game-definition.interface';

describe('RoomManagerService', () => {
  let roomManager: RoomManagerService;
  let gameRegistry: GameRegistryService;

  const mockGame: IGameDefinition = {
    gameType: 'test-game',
    name: 'Test Game',
    version: '1.0.0',
    init: jest.fn().mockReturnValue({ counter: 0 }),
    onPlayerJoin: jest.fn((state) => ({ newState: state })),
    onAction: jest.fn((state, action) => {
      if (action.type === 'INCREMENT') {
        return { newState: { counter: state.counter + 1 }, directResponse: { ok: true } };
      }
      return { newState: state };
    }),
    getClientState: jest.fn((state) => state),
    isFinished: jest.fn((state) => state.counter >= 5),
    getFinalResults: jest.fn((state) => ({ total: state.counter })),
  };

  beforeEach(() => {
    gameRegistry = new GameRegistryService();
    gameRegistry.register(mockGame);
    roomManager = new RoomManagerService(gameRegistry);
  });

  it('should create a room with unique code', async () => {
    const room = await roomManager.createRoom('host-123', 'test-game', {});

    expect(room).toBeDefined();
    expect(room.code).toHaveLength(6);
    expect(room.status).toBe('LOBBY');
    expect(room.gameType).toBe('test-game');
    expect(room.state).toEqual({ counter: 0 });
  });

  it('should allow players to join and reconnect', async () => {
    const room = await roomManager.createRoom('host-123', 'test-game', {});

    // Player joins
    const { player, isReconnection } = await roomManager.joinRoom(
      room.code,
      'Alice',
      'socket-1',
    );

    expect(player.name).toBe('Alice');
    expect(player.connected).toBe(true);
    expect(isReconnection).toBe(false);
    expect(roomManager.getRoomPlayers(room.code)).toHaveLength(1);

    // Player reconnects
    const reconnectResult = await roomManager.joinRoom(
      room.code,
      'Alice',
      'socket-2',
    );
    expect(reconnectResult.isReconnection).toBe(true);
    expect(reconnectResult.player.socketId).toBe('socket-2');
  });

  it('should dispatch actions and transition state', async () => {
    const room = await roomManager.createRoom('host-123', 'test-game', {});
    const { player } = await roomManager.joinRoom(room.code, 'Bob', 'socket-bob');

    const result = await roomManager.dispatchAction(room.code, {
      type: 'INCREMENT',
      payload: {},
      senderId: player.id,
      isHost: false,
      timestamp: new Date(),
    });

    expect(result.newState).toEqual({ counter: 1 });
    expect(roomManager.findRoom(room.code)?.state).toEqual({ counter: 1 });
  });
});
