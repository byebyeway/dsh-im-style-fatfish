// Fetch one npm tarball to a local file. Usage: node fetch-tarball.mjs <url> <out>
const [url, out] = process.argv.slice(2)
const res = await fetch(url, { redirect: 'follow' })
if (!res.ok) {
  console.error('HTTP ' + res.status)
  process.exit(1)
}
const buf = Buffer.from(await res.arrayBuffer())
const { writeFileSync } = await import('node:fs')
writeFileSync(out, buf)
console.log(out + ' ' + buf.length + ' bytes')
