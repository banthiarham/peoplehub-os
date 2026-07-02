/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@peoplehub/types', '@peoplehub/ui'],
  images: {
    domains: ['localhost'],
  },
};

module.exports = nextConfig;
