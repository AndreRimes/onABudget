/** @type {import('next').NextConfig} */
const nextConfig = {
    output: 'standalone',
}

module.exports = {
    output: 'standalone',
    // for security outside sources of images must be specified TODO make the domain be the pocketbase ip
    images: {
        domains: ['127.0.0.1'],
    },
}

module.exports = nextConfig
