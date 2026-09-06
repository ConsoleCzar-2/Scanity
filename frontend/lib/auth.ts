export type UserRole = 'admin' | 'user';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
}

export interface StoredUser extends UserProfile {
  passwordHash: string;
}

const STORAGE_USERS_KEY = 'scanity_registered_users';
const STORAGE_SESSION_KEY = 'scanity_auth_session';

// Pre-configured accounts
const DEFAULT_ACCOUNTS: StoredUser[] = [
  {
    id: 'admin-001',
    name: 'System Admin',
    email: 'admin@scanity.ai',
    role: 'admin',
    passwordHash: 'admin123',
    createdAt: '2026-09-01T00:00:00.000Z',
  },
  {
    id: 'user-001',
    name: 'Demo Customer',
    email: 'user@scanity.ai',
    role: 'user',
    passwordHash: 'user123',
    createdAt: '2026-09-01T00:00:00.000Z',
  },
];

export function getStoredUsers(): StoredUser[] {
  if (typeof window === 'undefined') return DEFAULT_ACCOUNTS;
  try {
    const raw = localStorage.getItem(STORAGE_USERS_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(DEFAULT_ACCOUNTS));
      return DEFAULT_ACCOUNTS;
    }
    return JSON.parse(raw);
  } catch {
    return DEFAULT_ACCOUNTS;
  }
}

export function getCurrentUser(): UserProfile | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function login(email: string, password: string): { success: boolean; user?: UserProfile; error?: string } {
  if (typeof window === 'undefined') return { success: false, error: 'Browser environment required' };
  
  const cleanEmail = email.trim().toLowerCase();
  const users = getStoredUsers();
  const matched = users.find((u) => u.email.toLowerCase() === cleanEmail);

  if (!matched) {
    return { success: false, error: 'No account found with this email address.' };
  }

  if (matched.passwordHash !== password) {
    return { success: false, error: 'Incorrect password.' };
  }

  const sessionUser: UserProfile = {
    id: matched.id,
    name: matched.name,
    email: matched.email,
    role: matched.role,
    createdAt: matched.createdAt,
  };

  try {
    localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(sessionUser));
  } catch {
    // fallback
  }

  return { success: true, user: sessionUser };
}

export function registerCustomer(name: string, email: string, password: string): { success: boolean; user?: UserProfile; error?: string } {
  if (typeof window === 'undefined') return { success: false, error: 'Browser environment required' };

  const cleanName = name.trim();
  const cleanEmail = email.trim().toLowerCase();

  if (!cleanName) {
    return { success: false, error: 'Please enter your full name.' };
  }
  if (!cleanEmail || !cleanEmail.includes('@')) {
    return { success: false, error: 'Please enter a valid email address.' };
  }
  if (!password || password.length < 6) {
    return { success: false, error: 'Password must be at least 6 characters long.' };
  }

  const users = getStoredUsers();
  if (users.some((u) => u.email.toLowerCase() === cleanEmail)) {
    return { success: false, error: 'An account with this email already exists. Please log in.' };
  }

  // Security constraint: Registered users are ALWAYS created as standard 'user' (Customer).
  // Admin accounts can only be provisioned manually.
  const newUser: StoredUser = {
    id: `user-${Date.now()}`,
    name: cleanName,
    email: cleanEmail,
    role: 'user',
    passwordHash: password,
    createdAt: new Date().toISOString(),
  };

  users.push(newUser);

  try {
    localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(users));
  } catch {
    return { success: false, error: 'Storage write failed.' };
  }

  const sessionUser: UserProfile = {
    id: newUser.id,
    name: newUser.name,
    email: newUser.email,
    role: newUser.role,
    createdAt: newUser.createdAt,
  };

  try {
    localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(sessionUser));
  } catch {
    // ignore
  }

  return { success: true, user: sessionUser };
}

export function logout(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_SESSION_KEY);
  } catch {
    // ignore
  }
}

export function updateUserProfile(updated: Partial<UserProfile>): UserProfile | null {
  const current = getCurrentUser();
  if (!current) return null;

  const merged: UserProfile = {
    ...current,
    name: updated.name || current.name,
    email: updated.email || current.email,
  };

  try {
    localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(merged));
    
    // Also update in users list if present
    const users = getStoredUsers();
    const idx = users.findIndex((u) => u.id === current.id);
    if (idx !== -1) {
      users[idx] = {
        ...users[idx],
        name: merged.name,
        email: merged.email,
      };
      localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(users));
    }
  } catch {
    // ignore
  }

  return merged;
}
