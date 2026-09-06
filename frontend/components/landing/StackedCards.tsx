'use client';

import React, { useRef } from 'react';
import { motion, useScroll, useTransform, MotionValue } from 'framer-motion';
import { ShieldCheck, CheckCircle2 } from 'lucide-react';
import {
  SiPostgresql,
  SiRedis,
  SiCelery,
  SiGooglegemini,
} from 'react-icons/si';
import {
  LLM_MODEL_DISPLAY,
  VECTOR_DIMENSION,
  DEFAULT_THRESHOLD,
  CHUNK_SIZE_TOKENS,
  CHUNK_OVERLAP_TOKENS,
} from '@/lib/constants';

interface CardData {
  id: string;
  category: string;
  title: string;
  subtitle: string;
  description: string;
  icon: React.ReactNode;
  specs: string[];
}

const CARDS: CardData[] = [
  {
    id: 'pgvector',
    category: 'VECTOR STORE & METADATA',
    title: 'PostgreSQL 16 + pgvector',
    subtitle: 'Unified ACID Persistence & Sub-5ms Vector Retrieval',
    description:
      'Stores relational document schemas and 768-dimensional dense vector embeddings in a single ACID-compliant database. Fast approximate nearest-neighbor search via Hierarchical Navigable Small World (HNSW) indexing using vector_cosine_ops with zero orphaned embeddings on deletion.',
    icon: <SiPostgresql className="w-7 h-7 text-[#336791]" />,
    specs: [
      `Dimensions: ${VECTOR_DIMENSION}`,
      'Index: HNSW (m=16, ef=64)',
      'Distance: Cosine (<=>)',
      'Port: 5433',
    ],
  },
  {
    id: 'celery',
    category: 'ASYNCHRONOUS WORKER PIPELINE',
    title: 'Celery 5.6 + Redis 7 Queue',
    subtitle: 'Decoupled Background Task Processing',
    description:
      'Offloads CPU-heavy PDF document ingestion, PyMuPDF page-indexed text parsing, sliding window token chunking, and batch Gemini embedding generation to dedicated Celery worker processes. FastAPI returns HTTP 202 Accepted immediately without blocking API throughput.',
    icon: (
      <div className="flex items-center gap-2">
        <SiCelery className="w-7 h-7 text-[#37814A]" />
        <SiRedis className="w-7 h-7 text-[#DC382D]" />
      </div>
    ),
    specs: [
      'Broker: Redis 7 Alpine',
      'Extractor: PyMuPDF',
      `Chunking: ${CHUNK_SIZE_TOKENS} / ${CHUNK_OVERLAP_TOKENS}`,
      'State: Adaptive Polling',
    ],
  },
  {
    id: 'gemini',
    category: 'GROUNDED SYNTHESIS ENGINE',
    title: LLM_MODEL_DISPLAY,
    subtitle: 'Strict Context Grounding & Structured JSON Schema',
    description:
      'High-conviction question answering constrained strictly to retrieved context. Gemini is prompted with XML-wrapped candidate blocks and enforced via native Structured Output JSON schemas (GroundedAnswerSchema) with temperature 0.0 to prevent extrapolation and hallucination.',
    icon: <SiGooglegemini className="w-7 h-7 text-[#8E75FF]" />,
    specs: [
      `Model: ${LLM_MODEL_DISPLAY}`,
      'Temperature: 0.0',
      'Output: Typed JSON Schema',
      'Format: Verbatim Citations',
    ],
  },
  {
    id: 'relevance_gate',
    category: 'ANTI-HALLUCINATION GUARDRAILS',
    title: 'Relevance Threshold Gate & Validator',
    subtitle: 'Two-Tier Mathematical Defense & Post-Hoc Audit',
    description:
      'Rejects queries with similarity below 0.70 before passing context to the LLM, eliminating hallucinated answers at the source. Any citations produced by the model undergo post-hoc database verification to mathematically guarantee cited chunk UUIDs exist in the PostgreSQL candidate set.',
    icon: <ShieldCheck className="w-7 h-7 text-emerald-400" />,
    specs: [
      `Gate: >= ${(DEFAULT_THRESHOLD * 100).toFixed(0)}% Similarity`,
      'Validation: Post-Hoc Verification',
      'Audit: Cascading Foreign Keys',
      'Integrity: Groundedness Guard',
    ],
  },
];

interface StickyCardProps {
  i: number;
  card: CardData;
  progress: MotionValue<number>;
  range: [number, number];
  targetScale: number;
}

function StickyCard({ i, card, progress, range, targetScale }: StickyCardProps) {
  const scale = useTransform(progress, range, [1, targetScale]);

  return (
    <div
      style={{
        top: `calc(76px + ${i * 36}px)`,
        zIndex: i + 10,
      }}
      className="sticky w-full max-w-4xl"
    >
      <motion.div
        style={{
          scale,
        }}
        className="relative w-full rounded-2xl bg-[#11151c] border border-[#1c232f] hover:border-[#2f3c4e] p-6 sm:p-7 shadow-[0_20px_50px_rgba(0,0,0,0.95)] transition-colors origin-top flex flex-col justify-between min-h-[290px] sm:min-h-[310px]"
      >
        {/* Top Row: Index Badge & Product Brand Logo */}
        <div className="flex items-center justify-between pb-3.5 border-b border-[#1c232f]">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-[#161c26] text-slate-300 border border-[#222b3a]">
              0{i + 1}
            </span>
            <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
              {card.category}
            </span>
          </div>

          <div className="p-1.5 rounded-lg bg-[#161c26] border border-[#222b3a]">
            {card.icon}
          </div>
        </div>

        {/* Content Body */}
        <div className="py-3">
          <h3 className="text-lg sm:text-xl font-bold text-white tracking-tight mb-1">
            {card.title}
          </h3>
          <p className="text-xs font-mono text-indigo-400 mb-2">
            {card.subtitle}
          </p>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-3xl">
            {card.description}
          </p>
        </div>

        {/* Specifications Matrix Footer */}
        <div className="pt-3.5 border-t border-[#1c232f] flex flex-wrap items-center gap-2 sm:gap-3">
          {card.specs.map((spec, specIdx) => (
            <div
              key={specIdx}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#090b0e] border border-[#1c232f] text-[11px] font-mono text-slate-400"
            >
              <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
              <span>{spec}</span>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

export function StackedCards() {
  const container = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: container,
    offset: ['start start', 'end end'],
  });

  return (
    <div className="w-full flex flex-col items-center">
      {/* Header bar indicating card stack scroll */}
      <div className="w-full max-w-4xl flex items-center justify-between pb-3 border-b border-[#1c232f] mb-6">
        <span className="text-xs font-mono uppercase tracking-wider text-slate-400">
          Core Architecture &amp; Verification Tiers
        </span>
        <span className="text-xs font-mono text-slate-400">
          04 Stacked Tiers (Scroll to reveal)
        </span>
      </div>

      {/* Sticky Card Stack Container */}
      <div
        ref={container}
        className="relative w-full flex flex-col items-center gap-10 sm:gap-14 pb-20"
      >
        {CARDS.map((card, i) => {
          const targetScale = Math.max(
            0.88,
            1 - (CARDS.length - i - 1) * 0.04
          );

          return (
            <StickyCard
              key={card.id}
              i={i}
              card={card}
              progress={scrollYProgress}
              range={[i * 0.25, 1]}
              targetScale={targetScale}
            />
          );
        })}
      </div>
    </div>
  );
}
