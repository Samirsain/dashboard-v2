import MobileHeader from "@/components/MobileHeader";
import SideNav from "@/components/SideNav";
import InitialsAvatar from "@/components/InitialsAvatar";

const rows = [
  {
    id: "qh9a8lx",
    desc: "Finalize structural integrity report for Block C",
    doer: "J. Doe",
    priority: "High",
    status: "Pending",
  },
  {
    id: "sf6jdgz",
    desc: "Audit Q3 expenditure vs allocated budget",
    doer: "A. Smith",
    priority: "Med",
    status: "Completed",
  },
  {
    id: "klxubuh",
    desc: "Review vendor contracts for 2024 compliance",
    doer: "L. Chen",
    priority: "High",
    status: "Pending",
  },
  {
    id: "v9c9e3c",
    desc: "Deploy security patch v4.2 across mainframes",
    doer: "M. Torres",
    priority: "Low",
    status: "Completed",
  },
];

function PriorityBadge({ priority }: { priority: string }) {
  if (priority === "High") {
    return (
      <span className="inline-block bg-on-surface text-surface-container-lowest font-label-sm text-label-sm uppercase px-2 py-0.5">
        High
      </span>
    );
  }
  return (
    <span className="inline-block border border-on-surface text-on-surface font-label-sm text-label-sm uppercase px-2 py-0.5">
      {priority}
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  if (status === "Completed") {
    return (
      <span className="inline-block border-2 border-on-surface bg-on-surface text-surface-container-lowest font-label-sm text-label-sm uppercase px-3 py-1">
        Completed
      </span>
    );
  }
  return (
    <span className="inline-block border-2 border-on-surface text-on-surface font-label-sm text-label-sm uppercase px-3 py-1">
      Pending
    </span>
  );
}

export default function TaskListPage() {
  return (
    <>
      <MobileHeader />
      <SideNav active="task-list" />

      <div className="md:ml-64 flex-1 flex flex-col bg-background">
        {/* TopNavBar */}
        <header className="hidden md:flex bg-surface w-full border-b-2 border-on-surface justify-between items-center h-16 px-container-padding sticky top-0 z-30">
          <div className="flex items-center gap-gutter">
            <div className="flex items-center gap-2 border-b-2 border-on-surface pb-1">
              <span className="material-symbols-outlined text-on-surface-variant">
                search
              </span>
              <input
                className="bg-transparent border-none focus:ring-0 p-0 font-data-mono text-data-mono uppercase text-on-surface placeholder-on-surface-variant w-48"
                placeholder="QUERY DATABASE"
                type="text"
              />
            </div>
          </div>

          <nav className="hidden lg:flex items-center gap-stack-lg">
            <a
              className="text-on-surface-variant font-headline-md text-headline-md hover:text-primary underline decoration-2 transition-all"
              href="#"
            >
              Portfolio
            </a>
            <a
              className="text-on-surface-variant font-headline-md text-headline-md hover:text-primary underline decoration-2 transition-all"
              href="#"
            >
              Analytics
            </a>
            <a
              className="text-on-surface-variant font-headline-md text-headline-md hover:text-primary underline decoration-2 transition-all"
              href="#"
            >
              Reports
            </a>
          </nav>

          <div className="flex items-center gap-stack-md">
            <div className="font-data-mono text-data-mono text-on-surface px-3 py-1 border-2 border-on-surface uppercase">
              2026-07-03
            </div>
            <div className="font-label-sm text-label-sm text-primary hidden md:block">
              Operational Status: Active
            </div>
            <div className="flex items-center gap-2 border-l-2 border-on-surface pl-stack-md ml-base">
              <button className="text-on-surface hover:bg-surface-container p-1 transition-colors">
                <span className="material-symbols-outlined">notifications</span>
              </button>
              <button className="text-on-surface hover:bg-surface-container p-1 transition-colors">
                <span className="material-symbols-outlined">account_circle</span>
              </button>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 md:p-stack-lg flex flex-col gap-stack-lg">
          <div className="flex justify-between items-end border-b-2 border-on-surface pb-stack-md">
            <div>
              <h2 className="font-headline-lg-mobile text-headline-lg-mobile md:font-headline-xl md:text-headline-xl text-on-surface uppercase tracking-tighter">
                Active Task Directory
              </h2>
              <p className="font-data-mono text-data-mono text-on-surface-variant mt-2 uppercase">
                18 entries &bull; System Live
              </p>
            </div>
            <div className="flex gap-stack-sm">
              <button className="px-4 py-2 border-2 border-on-surface font-label-sm text-label-sm uppercase hover:bg-surface-container transition-colors">
                Export CSV
              </button>
              <button className="px-4 py-2 bg-on-surface text-surface-container-lowest border-2 border-on-surface font-label-sm text-label-sm uppercase hover:bg-primary transition-colors">
                Filter View
              </button>
            </div>
          </div>

          <div className="w-full bg-surface-container-lowest border-2 border-on-surface overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead className="bg-surface-container text-on-surface font-label-sm text-label-sm uppercase border-b-2 border-on-surface">
                <tr>
                  <th className="py-3 px-4 w-32 border-r border-surface-variant">ID</th>
                  <th className="py-3 px-4 border-r border-surface-variant">
                    Task Description
                  </th>
                  <th className="py-3 px-4 w-40 border-r border-surface-variant">Doer</th>
                  <th className="py-3 px-4 w-32 border-r border-surface-variant text-center">
                    Priority
                  </th>
                  <th className="py-3 px-4 w-40 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="font-body-md text-body-md text-on-surface">
                {rows.map((row, i) => (
                  <tr
                    key={row.id}
                    className={`hover:bg-surface-container-low transition-colors group ${
                      i !== rows.length - 1 ? "border-b border-surface-variant" : ""
                    }`}
                  >
                    <td className="py-3 px-4 font-data-mono text-data-mono border-r border-surface-variant">
                      {row.id}
                    </td>
                    <td className="py-3 px-4 border-r border-surface-variant group-hover:underline cursor-pointer">
                      {row.desc}
                    </td>
                    <td className="py-3 px-4 border-r border-surface-variant">
                      <div className="flex items-center gap-2">
                        <InitialsAvatar
                          name={row.doer}
                          className="w-6 h-6 border border-on-surface"
                        />
                        <span className="font-label-sm text-label-sm uppercase truncate">
                          {row.doer}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 border-r border-surface-variant text-center">
                      <PriorityBadge priority={row.priority} />
                    </td>
                    <td className="py-3 px-4 text-center">
                      <StatusPill status={row.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </main>
      </div>
    </>
  );
}
