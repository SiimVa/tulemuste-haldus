import type { PublicRegistrationApplicationStatus } from "@/lib/registrationApplications"

type PublicApplication = {
  id: string
  teamName: string
  status: PublicRegistrationApplicationStatus
  waitlistPosition: number | null
  class: { name: string } | null
}

const GROUPS: {
  statuses: PublicRegistrationApplicationStatus[]
  title: string
  description: string
  color: string
}[] = [
  {
    statuses: ["CONFIRMED"],
    title: "Võistlusele pääsenud",
    description: "Võistkonnad, kelle osalemiskoht on kinnitatud.",
    color: "bg-green-100 text-green-700",
  },
  {
    statuses: ["WAITLISTED"],
    title: "Ootenimekirjas",
    description: "Võistkonnad, kes ootavad osalemiskoha vabanemist.",
    color: "bg-amber-100 text-amber-800",
  },
  {
    statuses: ["PENDING_REVIEW", "CHANGES_REQUESTED"],
    title: "Registreering kontrollimisel",
    description: "Võistkonnad, kelle registreering ootab korraldaja otsust.",
    color: "bg-blue-100 text-blue-700",
  },
]

export function PublicRegistrationList({
  applications,
}: {
  applications: PublicApplication[]
}) {
  return (
    <section className="bg-white border rounded-xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-gray-900">
            Registreerunud võistkonnad
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Avalikult kuvatakse ainult võistkonna nimi, klass ja registreerimise
            staatus. Liikmete ega kontaktisikute andmeid ei avaldata.
          </p>
        </div>
        <span className="text-xs bg-gray-100 text-gray-700 rounded-full px-2.5 py-1">
          {applications.length} võistkonda
        </span>
      </div>

      {applications.length === 0 ? (
        <p className="text-sm text-gray-500 mt-4">
          Ühtegi avalikku registreeringut veel pole.
        </p>
      ) : (
        <div className="space-y-5 mt-5">
          {GROUPS.map((group) => {
            const groupApplications = applications
              .filter((application) =>
                group.statuses.includes(application.status)
              )
              .sort((left, right) => {
                if (left.status !== "WAITLISTED") return 0
                return (
                  (left.waitlistPosition ?? Number.MAX_SAFE_INTEGER) -
                  (right.waitlistPosition ?? Number.MAX_SAFE_INTEGER)
                )
              })
            if (groupApplications.length === 0) return null

            return (
              <div key={group.title}>
                <div className="flex flex-wrap items-baseline gap-2">
                  <h3 className="text-sm font-semibold text-gray-900">
                    {group.title}
                  </h3>
                  <span
                    className={`text-xs rounded-full px-2 py-0.5 ${group.color}`}
                  >
                    {groupApplications.length}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  {group.description}
                </p>
                <ul className="divide-y mt-2 border rounded-lg">
                  {groupApplications.map((application) => (
                    <li
                      key={application.id}
                      className="px-3 py-2.5 flex flex-wrap items-center justify-between gap-2"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {application.teamName}
                        </p>
                        {application.class && (
                          <p className="text-xs text-gray-500 mt-0.5">
                            Klass: {application.class.name}
                          </p>
                        )}
                      </div>
                      {application.status === "WAITLISTED" &&
                        application.waitlistPosition && (
                          <span className="text-xs font-medium text-amber-800">
                            Ootenimekirja koht {application.waitlistPosition}
                          </span>
                        )}
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
