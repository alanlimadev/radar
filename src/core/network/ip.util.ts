import { networkInterfaces } from 'os';

// Prefixos de IP de adaptadores virtuais conhecidos que devem ser ignorados
const VIRTUAL_ADAPTER_PREFIXES = [
  '172.',       // WSL2 e Docker
  '192.168.56', // VirtualBox Host-Only
  '192.168.224',// VMware NAT
  '192.168.57', // VirtualBox alternativo
];

function isVirtualAdapter(ip: string): boolean {
  return VIRTUAL_ADAPTER_PREFIXES.some((prefix) => ip.startsWith(prefix));
}

export function getLocalIpAddress(): string {
  const nets = networkInterfaces();
  const realIps: string[] = [];

  for (const name of Object.keys(nets)) {
    const netList = nets[name];
    if (!netList) continue;

    for (const net of netList) {
      if (net.family !== 'IPv4' || net.internal) continue;

      // 1. Hotspot do Windows tem prioridade máxima (sempre correto para esse cenário)
      if (net.address === '192.168.137.1') {
        return net.address;
      }

      // 2. Ignorar adaptadores virtuais (VMware, VirtualBox, WSL2, Docker)
      if (isVirtualAdapter(net.address)) continue;

      realIps.push(net.address);
    }
  }

  // 3. Retornar o primeiro IP real encontrado (Wi-Fi ou Ethernet)
  if (realIps.length > 0) {
    return realIps[0];
  }

  // 4. Fallback seguro
  return '192.168.137.1';
}

/**
 * Retorna todas as IPs reais disponíveis (para debug ou exibição ao Host)
 */
export function getAllLocalIpAddresses(): string[] {
  const nets = networkInterfaces();
  const realIps: string[] = [];

  for (const name of Object.keys(nets)) {
    const netList = nets[name];
    if (!netList) continue;

    for (const net of netList) {
      if (net.family !== 'IPv4' || net.internal) continue;
      if (!isVirtualAdapter(net.address)) {
        realIps.push(net.address);
      }
    }
  }

  return realIps;
}
