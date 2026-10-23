# Modal height and scrolling

Shared modals use the visible viewport height (`100dvh`) minus top/bottom safety
gaps as their maximum height. The gaps are 20px each on desktop and 12px each
under the common phone/landscape media query, or the device safe-area inset when
larger. There is no fixed 760px ceiling. CSS recalculates the cap when the viewport
changes; no per-screen JavaScript measurement is required.

All regular, compact and invitation modals keep `height:auto`. Short content ends
at its normal bottom padding immediately before the footer. Longer content grows
to the available height, then scrolls inside the body while the header and action
footer remain visible. Scrollbars are not hidden and content is never clipped as
a substitute for scrolling. Mobile details retain full width but no longer force
an empty body to fill the screen. The dialog keeps rounded corners and safe gaps.

Tables inside a modal and book-lookup results expand naturally into its body,
avoiding a second vertically scrolling region. Horizontal table scrolling and
bounded selection/date popovers remain available. The native avatar crop dialog
already has content-driven sizing and a browser viewport cap; its editing canvas
is not changed. The mobile navigation drawer is not a content modal.
