import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { networkInterfaces } from 'os';
import { join } from 'path';
import * as qrcode from 'qrcode';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const port = process.env.PORT ?? 3000;

  app.useStaticAssets(join(__dirname, '..', 'public'));

  await app.listen(port);

  console.log(`Servidor rodando na porta: ${port}`);
  console.log(`Endereços IP locais para conexão:`);

  const nets = networkInterfaces();
  const localAddresses: string[] = [];

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
        localAddresses.push(net.address);
      }
    });
  });

  if (localAddresses.length === 0) {
    Object.keys(nets).forEach((name) => {
      nets[name]?.forEach((net) => {
        if (
          !net.internal &&
          net.family === 'IPv4' &&
          !net.address.startsWith('172.')
        ) {
          localAddresses.push(net.address);
        }
      });
    });
  }

  console.log('IPs encontrados:');
  localAddresses.forEach((ip) => console.log(`- ${ip}`));

  for (const ip of localAddresses) {
    if (ip === '127.0.0.1') continue;

    const url = `http://${ip}:${port}/client.html`;
    console.log(`\nQR Code para acessar: ${url}`);

    qrcode.toString(url, { type: 'terminal' }, (err, qr) => {
      if (!err) {
        console.log(qr);
        console.log('Escaneie o QR Code acima para conectar automaticamente');
      }
    });
  }
}
bootstrap();
