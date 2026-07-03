export default function MobileHeader() {
  return (
    <header className="md:hidden flex justify-between items-center h-16 w-full px-container-padding sticky top-0 z-30 bg-surface border-b-2 border-on-surface">
      <div className="font-headline-md text-headline-md font-black tracking-tighter text-on-surface">
        ThirtyMilestones
      </div>
      <div className="flex items-center gap-4">
        <span className="material-symbols-outlined text-on-surface">menu</span>
      </div>
    </header>
  );
}
