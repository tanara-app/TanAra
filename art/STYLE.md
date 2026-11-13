# «سرزمین»: سند سبک تصویرها

تصویرهای بازی با ChatGPT ساخته می‌شوند، در یک پروژه به اسم «سرزمین — تصویرها» (حساب سازنده).
تصمیم ۲۰۲۶-۱۱-۱۱: بناهای ثابت **مستقیم همان تصویر ChatGPT** هستند. Meshy (و Tripo) امتحان شد و جزئیات را خراب
می‌کرد (مثلاً سر پرنده‌ی بالدار درنمی‌آمد)؛ اشتراکش فعلاً گرفته نمی‌شود. سه‌بعدی (Meshy + Blender) فقط شاید بعداً
برای چیزهای متحرک (آدمک، شتر، سیمرغ). متن‌ها انگلیسی‌اند، چون مدل تصویر با انگلیسی دقیق‌تر کار می‌کند.
وقتی سبک انتخاب شد، بخش «Style» در دستورالعمل پروژه با همان سبک پر می‌شود و تصویر برنده به فایل‌های پروژه اضافه می‌شود.

**به‌روزرسانی ۲۰۲۶-۱۱-۱۳** (جزئیات در IDEAS.md):
- روند تازه: ChatGPT چهار نما می‌کشد، Meshy (MCP وصل روی حساب m.b.a) از آن‌ها مدل می‌سازد، Claude در Blender با
  زاویه‌ی بازی رندر می‌کند. تصویر ChatGPT از نمای بازی فقط برای مقایسه و پشتیبان است.
- برای چند تصویر با هم، متن در **چت عادی ChatGPT روی حالت Work** فرستاده می‌شود، نه در پروژه. پس هر متن باید همه‌ی
  قاعده‌های این سند (سبک، دوربین، پس‌زمینه) را خودش داشته باشد.
- هر متن برای ChatGPT صریح بگوید **تصویر را خودت بکش** («GENERATE IMAGES… Draw every image yourself… do not describe»)؛
  سازنده این را خواست.
- برای نمای بازی، عدد بده نه فقط کلمه: چرخش دقیقاً ۴۵ درجه، دو طرف هم‌اندازه، گوشه‌ی پایین روی خط وسط، لوزی دو برابر
  پهن‌تر از ارتفاع (شیب لبه‌ها ۲۶٫۶ درجه)، لوزی حدود ۸۰٪ پهنای تصویر با حاشیه‌ی شفاف. ChatGPT بدون عدد بنا را کج و
  با دوربین تند (حدود ۳۳ درجه) می‌کشد، و **حتی با عدد هم پایه‌ی بنا را درست نکشید** (۲۰۲۶-۱۱-۱۳، سازنده هم دید).
  پس برای زاویه‌ی دقیق بازی به ChatGPT تکیه نکن: تصویر بازی از رندر Blender می‌آید.
- نماهای مدل‌سازی: هر نما جدا و دست‌کم ۱۰۲۴ پیکسل؛ هر بخشی که در نمای بازی هست (حوض، پله، برج) در نماها هم باشد؛
  بدون پرچم و میله‌ی نازک (در Meshy خراب می‌شوند).

## دستورالعمل پروژه (Project instructions)

```text
You make the art for «سرزمین», an original mobile city-builder game set in ancient Iran and the wider Middle East.
Every image is one game asset. Follow these rules in every image unless I say otherwise.

Theme
- Architecture of ancient and historic Iran and its neighbours: Achaemenid (Persepolis, Pasargadae), Sassanid
  (Taq-e Kasra, fire temples), Safavid (tilework, domes), desert Iran (windcatchers, qanats, caravanserais, adobe
  citadels like Arg-e Bam), and Mesopotamia (ziggurats, Ishtar Gate, lamassu).
- Creatures and heroes from Iranian myth (Shahnameh: Simurgh, Homa, Rostam, Rakhsh, the divs) and the region.
- Materials: warm sandstone, sun-dried adobe, terracotta brick, cedar wood, turquoise and lapis-blue glazed tiles,
  gold accents.
- Every design is original. Do not copy or imitate Clash of Clans, Supercell, or any existing game's buildings,
  characters, icons or art style.

Camera and composition (identical for every building)
- Isometric game view: the camera looks down at about 30 degrees, rotated 45 degrees, so the square footprint is a
  2:1 diamond with one corner pointing straight down at the viewer.
- The building stands on its own diamond footprint only: no ground, grass, sand or scenery beyond the footprint.
- Centered, the whole object visible, with empty margin around it. Square image.
- Light always comes from the upper left; shadows fall to the lower right. A soft contact shadow only inside the
  footprint.
- Transparent background (PNG).

Readability
- It must read clearly at the size of a thumbnail on a phone: strong silhouette, slightly exaggerated proportions,
  big shapes before small details.
- No text, letters, numbers, signs, logos, watermarks or UI in the image.

Sizes (a footprint is N×N tiles; one tile is about the size of a small hut)
- palace 3×3, caravanserai 2×2, garden 2×2, windcatcher 1×1. Keep the same scale between buildings.

Style
- Soft realistic 3D render, like a detailed handcrafted stone and clay diorama model: natural materials (carved
  sandstone, sun-dried adobe, terracotta brick, cedar wood, turquoise glazed tile, real gold), fine surface texture,
  warm late-afternoon light, subtle ambient occlusion, a gentle miniature-model feel.
- Rich but natural colours. Not cartoonish, not glossy plastic, not painterly.
- Strictly a corner view: one corner of the footprint points straight down at the viewer and both sides of the
  building are seen equally (not a front view, not turned only a little).
- Nothing outside the footprint: no shadow, haze or vignette on the transparent background.
```

سبک انتخاب‌شده (۲۰۲۶-۱۱-۱۱): **ماکت (C)**. تصویر کاخ همین سبک باید به فایل‌های پروژه اضافه شود تا مرجع بقیه باشد.
دو خط آخر Style برای ایرادهای کاخ آزمایشی است (کمی از روبه‌رو بود و سایه‌ی کم‌رنگی بیرون از زمینش داشت).

## آزمایش سبک

هر کدام را در یک گفت‌وگوی تازه‌ی همان پروژه بفرست؛ از هر سبک یک کاخ و یک سکه.

### کاخ

```text
Style test, version A: stylized 3D game art, bright and glossy, chunky rounded shapes, saturated colours,
clean soft lighting, like a polished modern mobile strategy game (but an original design).

Asset: the palace, 3×3 footprint, the main building of the player's city. A royal audience hall inspired by
the Apadana of Persepolis: a stepped stone terrace with a grand double staircase in front, rows of tall slender
columns topped with double-bull capitals, a cedar-beamed roof, carved reliefs of guards along the terrace
walls, a gold winged-disc ornament above the entrance, small turquoise tile accents.
```

```text
Style test, version B: painterly, inspired by Persian miniature painting, flat rich colours, fine gold
outlines, decorative patterns, gentle shading (still an isometric 3D-looking building, not a flat drawing).

Asset: [same palace description as version A]
```

```text
Style test, version C: soft realistic 3D render, like a detailed handcrafted clay or stone diorama model,
natural materials, warm late-afternoon light, subtle ambient occlusion.

Asset: [same palace description as version A]
```

### سکه (برای هر سبک، در همان گفت‌وگو)

```text
Now, in exactly the same style: the game's coin icon. A single gold coin seen slightly from above, thick rim,
an embossed Simurgh (the mythical Persian bird) on its face, a ring of simple geometric pattern around it.
Icon only, centered, transparent background, no text or numbers. This is a UI icon, so the isometric
building rules do not apply to it.
```
