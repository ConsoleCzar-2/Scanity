'use client';

import React, { useEffect, useState } from 'react';
import { LandingPage } from '@/components/landing/LandingPage';
import { api } from '@/lib/api';
import type { HealthResponse } from '@/types/api';

export default function HomePage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthLoading, setHealthLoading] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;
    api
      .checkHealth()
      .then((data) => {
        if (isMounted) {
          setHealth(data);
          setHealthLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setHealth(null);
          setHealthLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return <LandingPage health={health} healthLoading={healthLoading} />;
}
