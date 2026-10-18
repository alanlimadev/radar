import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  NotFoundException,
} from '@nestjs/common';
import { existsSync } from 'fs';
import { join } from 'path';
import type { Request, Response } from 'express';

/**
 * Fallback do SPA: quando uma rota nao casa com nenhum controller, devolve o
 * `index.html` do client para o roteamento do front (ex.: `/game`, `/loginScreen`).
 *
 * Motivo de existir (e de nao usar o `@nestjs/serve-static`): o fallback daquele
 * pacote chama `res.sendFile(<caminho absoluto>)`, e o modulo `send` recusa
 * caminhos que tenham um componente iniciado por "." (trata como *dotfile*,
 * devolvendo 404 "Not Found"). O AppImage monta o app em `/tmp/.mount_XXXX/...`,
 * entao TODA rota do SPA respondia 404, mesmo com o `index.html` acessivel.
 *
 * Aqui usamos `res.sendFile('index.html', { root })`: com `root` definido o
 * `send` avalia as partes a partir do caminho relativo, evitando o dotfile.
 */
@Catch(NotFoundException)
export class SpaFallbackFilter implements ExceptionFilter {
  private readonly indexHtml = 'index.html';

  constructor(
    private readonly clientPath: string = join(process.cwd(), 'client'),
  ) {}

  catch(exception: NotFoundException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const method = String(request.method ?? 'GET').toUpperCase();
    const isUnmatchedRoute = /^Cannot\s+(GET|HEAD)\s/i.test(
      String(exception.message ?? ''),
    );
    const canServeClient =
      (method === 'GET' || method === 'HEAD') &&
      isUnmatchedRoute &&
      existsSync(join(this.clientPath, this.indexHtml));

    if (canServeClient) {
      response.sendFile(this.indexHtml, { root: this.clientPath }, (err) => {
        if (err && !response.headersSent) {
          response
            .status(exception.getStatus())
            .json(exception.getResponse());
        }
      });
      return;
    }

    response.status(exception.getStatus()).json(exception.getResponse());
  }
}
