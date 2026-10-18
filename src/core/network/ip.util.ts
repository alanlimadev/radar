import { networkInterfaces } from 'os';

// IP do hotspot do Windows — tem prioridade máxima (cenário clássico do projeto)
const WINDOWS_HOTSPOT_IP = '192.168.137.1';

// Interfaces virtuais conhecidas (por NOME). Filtrar por nome cobre VPNs e
// adaptadores que o IP sozinho não distingue (ex.: Cloudflare WARP, WSL, Hyper-V).
const VIRTUAL_INTERFACE_PATTERNS = [
  /virtual/i, // VirtualBox, Hyper-V Virtual Ethernet, "Virtual Adapter"
  /vmware/i,
  /vmnet/i,
  /vbox/i,
  /hyper-?v/i,
  /wsl/i,
  /ve[td]hernet/i,
  /loopback/i,
  /docker/i,
  /podman/i,
  /veth/i,
  /virbr/i,
  /^br-/i,
  /tun\d/i,
  /tap\d/i,
  /wg\d/i,
  /warp/i, // Cloudflare WARP
  /cloudflare/i,
  /tailscale/i,
  /^zt/i,
  /ham\d/i,
];

// Faixas de IP de adaptadores virtuais conhecidos.
// Obs.: NÃO filtramos todo '172.' — isso descartava redes legítimas
// (ex.: hotspot de iPhone usa 172.20.10.x). VPNs 172.x são pegas pelo nome.
const VIRTUAL_IP_PREFIXES = [
  '169.254.', // APIPA / link-local (nunca roteável)
  '192.168.56.', // VirtualBox Host-Only
  '192.168.57.', // VirtualBox Host-Only (alternativo)
  '192.168.224.', // VMware NAT
];

function isVirtualInterface(name: string): boolean {
  return VIRTUAL_INTERFACE_PATTERNS.some((pattern) => pattern.test(name));
}

function isVirtualAddress(entry: LocalIpEntry): boolean {
  return (
    isVirtualInterface(entry.name) ||
    VIRTUAL_IP_PREFIXES.some((prefix) => entry.address.startsWith(prefix))
  );
}

export interface LocalIpEntry {
  name: string;
  address: string;
}

function collectIpv4(): LocalIpEntry[] {
  const nets = networkInterfaces();
  const result: LocalIpEntry[] = [];

  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family !== 'IPv4' || net.internal) continue;
      result.push({ name, address: net.address });
    }
  }

  return result;
}

/**
 * Retorna o IP mais provável para os jogadores se conectarem, ou `null` se a
 * máquina não tiver nenhuma interface IPv4 utilizável.
 *
 * Importante: NUNCA inventa um IP que não exista na máquina (o antigo fallback
 * fixo `192.168.137.1` gerava links quebrados fora do hotspot do Windows).
 */
export function getLocalIpAddress(): string | null {
  const all = collectIpv4();

  // 1. Hotspot do Windows tem prioridade máxima (sempre correto nesse cenário)
  const hotspot = all.find((entry) => entry.address === WINDOWS_HOTSPOT_IP);
  if (hotspot) return hotspot.address;

  // 2. Preferir interfaces físicas (Wi-Fi / Ethernet)
  const physical = all.find((entry) => !isVirtualAddress(entry));
  if (physical) return physical.address;

  // 3. Último recurso: qualquer IP IPv4 real é melhor que devolver um IP inexistente
  return all.length > 0 ? all[0].address : null;
}

/**
 * Retorna todos os IPs utilizáveis (para o host escolher na interface).
 */
export function getAllLocalIpAddresses(): string[] {
  const all = collectIpv4();
  const physical = all
    .filter((entry) => !isVirtualAddress(entry))
    .map((entry) => entry.address);

  return physical.length > 0 ? physical : all.map((entry) => entry.address);
}
