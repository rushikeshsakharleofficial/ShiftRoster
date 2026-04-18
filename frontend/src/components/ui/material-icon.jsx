import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * Material Symbols Outlined icon. Requires the Google Font to be loaded
 * via index.html. Use as: <MIcon name="chat" />
 *
 * Props:
 *   name      string  — symbol name (e.g. "send", "mood", "add_circle")
 *   filled    bool    — fill the symbol (FILL axis = 1)
 *   size      number  — pixel size; sets width/height + font-size
 *   weight    number  — wght axis 100..700 (default 400)
 *   className string  — extra classes
 */
const MIcon = React.forwardRef(
  ({ name, filled = false, size = 20, weight = 400, className, style, ...props }, ref) => (
    <span
      ref={ref}
      className={cn("material-symbols-outlined inline-block leading-none align-middle shrink-0", className)}
      style={{
        fontSize: size,
        width: size,
        height: size,
        fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' ${weight}, 'GRAD' 0, 'opsz' ${size}`,
        ...style,
      }}
      {...props}
    >
      {name}
    </span>
  )
)
MIcon.displayName = "MIcon"

export { MIcon }
