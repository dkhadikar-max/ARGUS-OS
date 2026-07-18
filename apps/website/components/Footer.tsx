"use client";

export function Footer() {
  return (
    <footer className="relative z-10 border-t border-default py-12 text-center">
      <div className="font-mono text-[11px] text-slate">
        <div className="text-ash mb-4 italic">
          Every decision is a node. Every node is a lesson.
        </div>
        <div>
          ARGUS AI — Decision Operating System for B2B Revenue Teams
        </div>
        <div className="mt-4">
          <a href="mailto:support@argusai.online" className="hover:text-ash">
            support@argusai.online
          </a>
        </div>
      </div>
    </footer>
  );
}
