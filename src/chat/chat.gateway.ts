import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { networkInterfaces } from 'os';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private users: Map<string, string> = new Map();
  private serverIps: string[] = [];

  constructor() {
    this.serverIps = this.getServerIps();
  }

  handleConnection(client: Socket) {
    console.log(`Cliente conectado: ${client.id}`);

    client.emit('serverIps', {
      ips: this.serverIps,
      port: process.env.PORT || 3000,
    });
  }

  handleDisconnect(client: Socket) {
    console.log(`Cliente desconectado: ${client.id}`);
    const username = this.users.get(client.id);
    this.users.delete(client.id);

    if (username) {
      this.server.emit('userLeft', username);
    }
  }

  @SubscribeMessage('join')
  handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() username: string,
  ) {
    console.log(`Usuário ${username} tentando entrar no chat`);
    this.users.set(client.id, username);
    this.server.emit('userJoined', username);

    client.emit('joinResponse', {
      event: 'joined',
      data: `Bem-vindo, ${username}!`,
    });
    console.log(`Resposta de entrada enviada para ${username}`);
  }

  @SubscribeMessage('message')
  handleMessage(client: Socket, payload: any) {
    const sender = this.users.get(client.id) || 'Anônimo';
    const message = {
      sender,
      text: payload.text,
      timestamp: new Date().toISOString(),
    };
    this.server.emit('messageReceived', message);
  }

  @SubscribeMessage('typing')
  handleTyping(client: Socket, payload: any) {
    const username = this.users.get(client.id);
    if (username) {
      client.broadcast.emit('typing', {
        username,
        isTyping: payload?.isTyping || false,
      });
    }
  }

  private getServerIps(): string[] {
    const nets = networkInterfaces();
    const serverIps: string[] = [];

    Object.keys(nets).forEach((name) => {
      if (
        name.includes('WSL') ||
        name.includes('vEthernet') ||
        name.includes('Loopback')
      ) {
        return;
      }

      nets[name]?.forEach((net) => {
        if (!net.internal && net.family === 'IPv4') {
          serverIps.push(net.address);
        }
      });
    });

    if (serverIps.length === 0) {
      Object.keys(nets).forEach((name) => {
        nets[name]?.forEach((net) => {
          if (
            !net.internal &&
            net.family === 'IPv4' &&
            !net.address.startsWith('172.')
          ) {
            serverIps.push(net.address);
          }
        });
      });
    }

    return serverIps.filter((ip) => ip !== '127.0.0.1');
  }
}
