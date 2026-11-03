// The existing rice-bowl logo, separated into vector parts for gentle animation.
// Shared by the first HTML paint and React; no image download is needed.
export const loadingAnimationMarkup = `<svg class="loading-logo" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" focusable="false">
  <g fill="#243428">
    <path d="M83 180 Q88 175 96 179 L116 188 Q126 193 121 204 Q117 214 107 210 L83 200 Q73 195 78 186 Z"/>
    <path d="M137 145 Q132 133 143 130 Q154 126 159 138 L166 160 Q170 170 159 174 Q148 178 145 168 Z"/>
  </g>
  <path d="M103 152 Q112 143 120 151 L136 169 Q142 178 134 185 Q126 192 119 184 L101 165 Q96 158 103 152Z" fill="#e5edc8"/>
  <path d="M124 293 Q120 280 129 267 Q117 253 130 241 Q135 228 148 228 Q143 214 157 205 Q166 199 179 202 Q183 186 198 190 Q208 176 227 178 Q238 166 255 174 Q273 163 288 173 Q305 166 318 180 Q333 177 341 192 Q358 190 367 205 Q384 205 388 222 Q403 230 401 246 Q412 255 406 268 Q418 281 408 293Z" fill="#fffefb"/>
  <g class="loading-chopstick-left" fill="#243428"><path d="M318 207 L414 91 Q423 82 431 90 L440 98 Q447 106 439 114 L338 220Z"/></g>
  <g class="loading-chopstick-right" fill="#243428"><path d="M347 224 L454 131 Q463 123 471 131 L479 140 Q486 149 477 157 L360 237Z"/></g>
  <path d="M306 245 Q309 229 325 232 Q339 223 350 240 Q364 232 374 245 Q393 245 393 265 Q412 270 408 293 H124 Q120 280 129 267 Q142 258 155 265 Q164 250 180 259 Q197 249 208 263 Q224 253 239 264 Q253 251 268 263 Q288 248 306 245Z" fill="#fffefb"/>
  <g fill="#e0e8c1"><ellipse cx="182" cy="244" rx="15" ry="10" transform="rotate(30 182 244)"/><ellipse cx="167" cy="265" rx="9" ry="6" transform="rotate(20 167 265)"/><ellipse cx="263" cy="209" rx="12" ry="10" transform="rotate(-40 263 209)"/><ellipse cx="318" cy="247" rx="12" ry="10" transform="rotate(-35 318 247)"/><ellipse cx="365" cy="258" rx="14" ry="9" transform="rotate(-25 365 258)"/></g>
  <path d="M108 292 H424 Q435 292 432 305 C425 372 390 423 330 444 Q326 463 310 463 H224 Q208 463 204 445 C145 424 107 369 99 305 Q96 292 108 292Z" fill="#243428"/>
  <g class="loading-eyes" fill="none" stroke="#fffefb" stroke-width="14" stroke-linecap="round"><path d="M190 358 C190 334 224 334 227 358"/><path d="M305 358 C308 334 338 334 341 358"/></g>
  <path class="loading-smile" d="M240 379 C249 403 280 403 290 379" fill="none" stroke="#fffefb" stroke-width="14" stroke-linecap="round"/>
  <path class="loading-happy-mouth" d="M238 378 Q264 389 291 378 Q292 407 265 410 Q239 408 238 378Z" fill="#fffefb"/>
</svg>`;
export const bootLoadingMarkup = `<div class="app-loading-screen" role="status" aria-label="正在載入" aria-busy="true"><div class="loading-animation" aria-hidden="true">${loadingAnimationMarkup}</div></div>`;
