import { NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import { SpaFallbackFilter } from './spa-fallback.filter';

function makeHost(request: any, response: any): any {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  };
}

function makeResponse() {
  return {
    sendFile: jest.fn(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
    headersSent: false,
  };
}

describe('SpaFallbackFilter', () => {
  const clientPath = '/tmp/.mount_radar/server/client';

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('serve o index.html (com root) para rota nao encontrada do SPA', () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    const response = makeResponse();

    new SpaFallbackFilter(clientPath).catch(
      new NotFoundException('Cannot GET /game'),
      makeHost({ method: 'GET' }, response),
    );

    // caminho relativo + root: evita o bug de "dotfile" do send
    expect(response.sendFile).toHaveBeenCalledWith(
      'index.html',
      { root: clientPath },
      expect.any(Function),
    );
    expect(response.status).not.toHaveBeenCalled();
  });

  it('nao engole 404 vindo de um controller (mensagem diferente)', () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    const response = makeResponse();

    new SpaFallbackFilter(clientPath).catch(
      new NotFoundException('Quiz nao encontrado'),
      makeHost({ method: 'GET' }, response),
    );

    expect(response.sendFile).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.json).toHaveBeenCalled();
  });

  it('nao usa fallback quando o index.html nao existe', () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(false);
    const response = makeResponse();

    new SpaFallbackFilter(clientPath).catch(
      new NotFoundException('Cannot GET /game'),
      makeHost({ method: 'GET' }, response),
    );

    expect(response.sendFile).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(404);
  });

  it('nao usa fallback para metodos diferentes de GET/HEAD', () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    const response = makeResponse();

    new SpaFallbackFilter(clientPath).catch(
      new NotFoundException('Cannot POST /game'),
      makeHost({ method: 'POST' }, response),
    );

    expect(response.sendFile).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(404);
  });
});
