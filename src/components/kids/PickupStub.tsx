'use client'

export type StubChild = { id: string; first_name: string; room: string | null }

/**
 * The pickup stub: children on one side of the perforation, their code on the
 * other. The two halves match the way the child's sticker and the parent's
 * code must match at pickup.
 */
export default function PickupStub({ code, kids }: { code: string; kids: StubChild[] }) {
  return (
    <div
      className="kids-stub kids-stub-in flex w-full max-w-[820px] items-stretch"
      role="group"
      aria-label={`Pickup code ${code.split('').join(' ')}`}
    >
      <ul className="flex flex-1 flex-col justify-center gap-4 py-10 pl-10 pr-8 min-w-0">
        {kids.map((c) => (
          <li key={c.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="text-[34px] font-semibold leading-tight truncate">{c.first_name}</span>
            <span className="text-xl text-[#9fd3d0]">{c.room ?? 'Room to be assigned'}</span>
          </li>
        ))}
      </ul>
      <div className="kids-stub-perforation my-7" aria-hidden="true" />
      <div className="flex flex-col items-center justify-center px-10 py-10">
        <span className="text-lg text-[#9fd3d0] mb-3">Pickup code</span>
        <span className="kids-code text-[112px] sm:text-[132px]">{code}</span>
      </div>
    </div>
  )
}
