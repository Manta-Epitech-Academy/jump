/**
 * Whether an IP address belongs to the public internet.
 *
 * For an address somebody else chose and Jump connects to from inside the
 * cluster (an activity's cover, `images/remote.ts`). The pod reaches the
 * cluster's own services, the node, and whatever the cloud exposes on
 * link-local, none of which an admin, or a model holding an admin's token, has
 * any business pointing Jump at. So everything the special-purpose registries
 * set aside is refused, private ranges, loopback and link-local first.
 *
 * An IPv4-mapped IPv6 address (`::ffff:10.0.0.1`) is judged by the IPv4 rules,
 * which is what `BlockList` does on its own in Node and in Bun alike.
 */

import { BlockList, isIP } from 'node:net';

const NON_PUBLIC = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, cloud metadata included
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // protocol assignments
  ['192.0.2.0', 24], // documentation
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // documentation
  ['203.0.113.0', 24], // documentation
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, broadcast included
] as const) {
  NON_PUBLIC.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of [
  ['::', 128], // unspecified
  ['::1', 128], // loopback
  ['64:ff9b::', 96], // NAT64, which would carry the IPv4 ranges above
  ['64:ff9b:1::', 48], // local-use NAT64
  ['100::', 64], // discard
  ['2001:db8::', 32], // documentation
  ['fc00::', 7], // unique local
  ['fe80::', 10], // link-local
  ['ff00::', 8], // multicast
] as const) {
  NON_PUBLIC.addSubnet(network, prefix, 'ipv6');
}

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return false;
  return !NON_PUBLIC.check(address, family === 6 ? 'ipv6' : 'ipv4');
}
