import * as os from 'os';
import { getAllLocalIpAddresses, getLocalIpAddress } from './ip.util';

jest.mock('os');

const mockedNetworkInterfaces = os.networkInterfaces as jest.MockedFunction<
  typeof os.networkInterfaces
>;

type Iface = { address: string; internal?: boolean };

function withInterfaces(map: Record<string, Iface[]>) {
  const result: NodeJS.Dict<os.NetworkInterfaceInfo[]> = {};
  for (const [name, list] of Object.entries(map)) {
    result[name] = list.map((entry) => ({
      address: entry.address,
      netmask: '255.255.255.0',
      family: 'IPv4',
      mac: '00:00:00:00:00:00',
      internal: entry.internal ?? false,
      cidr: `${entry.address}/24`,
    }));
  }
  mockedNetworkInterfaces.mockReturnValue(result);
}

describe('ip.util', () => {
  afterEach(() => jest.resetAllMocks());

  it('prioriza o hotspot do Windows quando presente', () => {
    withInterfaces({
      'Wi-Fi': [{ address: '192.168.1.51' }],
      'Local Area Connection* 10': [{ address: '192.168.137.1' }],
    });

    expect(getLocalIpAddress()).toBe('192.168.137.1');
  });

  it('ignora VPN/adaptadores virtuais (por nome e por faixa de IP)', () => {
    withInterfaces({
      CloudflareWARP: [{ address: '172.16.0.2' }],
      'vEthernet (WSL (Hyper-V firewall))': [{ address: '172.22.224.1' }],
      'Ethernet 2': [{ address: '192.168.56.1' }], // VirtualBox Host-Only
      'Wi-Fi': [{ address: '192.168.1.51' }],
    });

    expect(getLocalIpAddress()).toBe('192.168.1.51');
    expect(getAllLocalIpAddresses()).toEqual(['192.168.1.51']);
  });

  it('NÃO descarta redes 172.x legítimas (ex.: hotspot de iPhone)', () => {
    withInterfaces({ wlan0: [{ address: '172.20.10.2' }] });

    expect(getLocalIpAddress()).toBe('172.20.10.2');
    expect(getAllLocalIpAddresses()).toEqual(['172.20.10.2']);
  });

  it('nunca inventa um IP quando não há interface utilizável', () => {
    withInterfaces({ lo: [{ address: '127.0.0.1', internal: true }] });

    expect(getLocalIpAddress()).toBeNull();
    expect(getAllLocalIpAddresses()).toEqual([]);
  });

  it('usa o melhor IP real disponível quando só há interface virtual', () => {
    withInterfaces({ docker0: [{ address: '172.17.0.1' }] });

    expect(getLocalIpAddress()).toBe('172.17.0.1');
    expect(getAllLocalIpAddresses()).toEqual(['172.17.0.1']);
  });

  it('ignora faixa link-local (169.254.x)', () => {
    withInterfaces({
      'LinkedIn Connection': [{ address: '169.254.10.10' }],
      wlan0: [{ address: '192.168.0.10' }],
    });

    expect(getAllLocalIpAddresses()).toEqual(['192.168.0.10']);
  });
});
