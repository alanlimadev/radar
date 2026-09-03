import { ArgumentsHost, Catch } from '@nestjs/common';
import { BaseWsExceptionFilter, WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';

@Catch()
export class RadarWsExceptionFilter extends BaseWsExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const client: Socket = host.switchToWs().getClient();

    let message = 'Erro interno no servidor';
    if (exception instanceof WsException) {
      message = exception.getError() as string;
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    client.emit('radar:error', { message });
    // Mantém compatibilidade com clientes que escutam 'error'
    client.emit('error', { message });
  }
}
