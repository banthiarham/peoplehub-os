import axios from 'axios';
import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

export const authOptions: NextAuthOptions = {
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials.password) return null;
        try {
          const { data } = await axios.post(`${API_URL}/api/v1/auth/login`, {
            email: credentials.email,
            password: credentials.password,
          });
          return {
            id: data.user.id,
            name: data.user.name,
            email: data.user.email,
            accessToken: data.accessToken,
            roles: data.user.roles,
            employeeId: data.user.employeeId,
            tenant: data.user.tenant,
          };
        } catch {
          return null;
        }
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.accessToken = user.accessToken;
        token.roles = user.roles;
        token.employeeId = user.employeeId;
        token.tenant = user.tenant;
      }
      return token;
    },
    session({ session, token }) {
      session.accessToken = token.accessToken;
      if (session.user) {
        session.user.roles = token.roles ?? [];
        session.user.employeeId = token.employeeId ?? null;
        session.user.tenant = token.tenant;
      }
      return session;
    },
  },
};
