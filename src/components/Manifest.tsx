export default function ManifestPage() {
  const brand = {
    pink: "#ffcdd6",
    pinkGlow: "rgba(255,131,176,0.22)",
    text: "#0e0e0e",
    card: "#ffffff",
    page: "#f7f7f8",
    border: "#ffffff",
  } as const;

  const Card: React.FC<React.PropsWithChildren<{ className?: string }>> = ({ className = "", children }) => (
    <div
      className={
        "rounded-2xl border shadow-[0_18px_40px_rgba(255,131,176,.18),0_4px_10px_rgba(0,0,0,.06)] " +
        "border-white bg-white " +
        className
      }
    >
      {children}
    </div>
  );

  const SectionTitle: React.FC<{ title: string; subtitle?: string }> = ({ title, subtitle }) => (
    <div className="mb-5">
      <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight">{title}</h2>
      {subtitle && <p className="mt-2 text-sm md:text-base text-neutral-600">{subtitle}</p>}
    </div>
  );

  const Bullet: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <li className="flex items-start gap-3 leading-relaxed">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ff83b0" strokeWidth="2" className="mt-1 shrink-0">
        <circle cx="12" cy="12" r="8" />
        <path d="M9 12l2 2 4-4" />
      </svg>
      <span>{children}</span>
    </li>
  );

  const StatPill: React.FC<{ label: string }> = ({ label }) => (
    <span className="inline-flex items-center gap-2 rounded-full border border-white bg-white px-3 py-1 text-xs font-semibold shadow-[0_10px_24px_rgba(255,131,176,.22)]">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ff83b0" strokeWidth="2"><path d="M3 12h18M12 3v18"/></svg>
      {label}
    </span>
  );

  return (
    <div className="min-h-screen w-full" style={{ background: brand.page, color: brand.text }}>
      {/* HERO */}
      <header className="relative overflow-hidden">
        {/* soft background blobs & gradient kept strictly behind content */}
        <div className="absolute inset-0 -z-10 pointer-events-none">
          <div className="absolute -top-24 -left-24 h-64 w-64 rounded-full blur-3xl opacity-60" style={{ background: "#ffdbe4" }} />
          <div className="absolute -bottom-24 -right-24 h-72 w-72 rounded-full blur-3xl opacity-60" style={{ background: "#ffcdd6" }} />
          <div className="absolute inset-0 bg-gradient-to-b from-[#fff5f8] via-[#ffeaf0]/60 to-transparent" />
        </div>

        <div className="mx-auto max-w-5xl px-5 pt-[calc(20px+env(safe-area-inset-top))] pb-8 md:pt-20 md:pb-10 relative z-10">
          <div className="flex flex-col items-center text-center gap-4 md:gap-5">
            <h1 className="text-3xl md:text-5xl font-extrabold leading-tight tracking-tight">
              Маніфест <span className="inline-block rounded-xl border border-white bg-white/95 px-2 shadow-[0_12px_30px_rgba(255,131,176,.22)]">BMB</span>
            </h1>
            <p className="max-w-3xl text-neutral-800 text-[15px] md:text-lg leading-7 md:leading-8">
              Buy My Behavior — цифровий Web3‑простір, де люди обмінюються сценаріями поведінки,
              узгоджують умови та захищають угоди ескроу‑смартконтрактом.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <StatPill label="Web3" />
              <StatPill label="Escrow Smart‑Contract" />
              <StatPill label="Open Source" />
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 pb-24">
        {/* ЩО ТАКЕ BMB */}
        <Card className="p-6 md:p-8">
          <SectionTitle title="Що таке BMB" />
          <div className="prose prose-neutral max-w-none">
            <p>
              Buy My Behavior — це цифровий Web3‑простір, де люди обмінюються між собою сценаріями поведінки.
              До сьогодні еволюція не дала нам можливості моделювати поведінку інших людей, читати їхні думки й ідеально
              взаємодіяти між собою.
            </p>
            <p>
              Дружнє середовище взаємних вчинків BMB дозволяє вам моделювати поведінку навколишніх людей з описом того,
              як саме людина має себе поводити — щоб для вас це було ідеальною комунікацією: де саме, в який час, які
              обставини й контекст огортають цю подію. Уявіть, що ви створюєте ідеальний фільм свого життя з акторів —
              незнайомих людей навколо. А ви самі також можете стати учасником цікавої історії, яку пише інша людина.
            </p>
            <p>
              BMB запропонував створювати обмін поведінкою як безкоштовний енергетичний обмін між учасниками. Водночас ми дозволили
              висловити благодійну подяку виконавцю в USDT — на підтримку його креативності, запису ще цікавіших біхейворсів та просто для
              вираження вдячності за добрі вчинки. У якій би країні ви не користувалися BMB, ви повинні розуміти, що не надаєте послуги,
              а безкоштовно обмінюєтеся сценаріями поведінки та виконуєте їх за бажанням.
            </p>
            <p>
              Під час реєстрації ви проходите KYC, і ми відкриваємо вам можливість отримувати благодійні внески в розмірі <b>до 1 000 USDT за одну угоду</b>.
              Якщо ви знаменита людина і ваша поведінка — це щось дійсно величне, що може примножувати добро, любов, чесноти, виручати та рятувати людей,
              ви можете пройти глибший KYC — тоді сума ваших благодійних донатів‑подяк становитиме <b>до 10 000 USDT за одну угоду</b>.
            </p>
            <p>
              Середовище BMB під’єднує ваш криптогаманець MetaMask і проводить ескроу‑смартконтракт на захищеному з’єднанні. Ми не маємо доступу до ваших ключів —
              усі угоди проходять ескроу‑смартконтрактом. Buy My Behavior створений з відкритим кодом. Кожен може зайти на GitHub і ознайомитися з архітектурою коду,
              оцінити захищеність і відкритість.
            </p>
          </div>
        </Card>

        {/* ЯК ЦЕ ПРАЦЮЄ */}
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <Card className="p-6 md:p-8">
            <SectionTitle title="Як це працює" subtitle="Ключові кроки користувача" />
            <ol className="space-y-3 text-[15px] leading-relaxed">
              <li><b>1.</b> Отримавши реферальне слово від Амбасадора BMB, ви реєструєтесь і потрапляєте на сторінку «Профіль», де заповнюєте інформацію про себе, під’єднуєте MetaMask і проходите KYC.</li>
              <li><b>2.</b> Ви можете вказати місце роботи чи описати, які цікаві життєві комбінації здатні втілити. Люди моделюють із вас свої сценарії.</li>
              <li><b>3.</b> Кожен учасник відстежується на карті <b>за згодою користувача</b> (видимість можна вимкнути/обмежити). Карта працює в реальному часі.</li>
              <li><b>4.</b> Оберіть виконавця → натисніть «Замовити поведінку» → узгодьте опис сценарію, час/дату/локацію та, за бажання, суму донату.</li>
              <li><b>5.</b> Після натискання «Погодити угоду» ескроу‑смартконтракт блокує донат на гаманці замовника. Після виконання — переказує його автоматично.</li>
            </ol>
          </Card>

          <Card className="p-6 md:p-8">
            <SectionTitle title="Замовлення" subtitle="Що саме описати" />
            <ul className="space-y-3 text-[15px]">
              <Bullet>Опишіть сценарій, який повинен виконати виконавець, та важливі нюанси ідеальної взаємодії.</Bullet>
              <Bullet>Вкажіть час і дату, виберіть місце на карті.</Bullet>
              <Bullet>За бажанням додайте суму донату в USDT для підтримки творчості виконавця.</Bullet>
            </ul>
          </Card>
        </div>

        {/* ЕЛЕМЕНТ СПОРУ */}
        <Card className="mt-8 p-6 md:p-8">
          <SectionTitle title="Елемент спору" />
          <div className="space-y-4 text-[15px] leading-relaxed">
            <p>
              Якщо замовник не впевнений у виконанні, він може натиснути «Оскаржити виконання». Умикається смартконтракт спору. Виконавець завантажує біхейворс‑доказ.
              Чи відправляти кошти виконавцю — вирішують учасники BMB через голосування на сторінці «Вибрати виконавця».
            </p>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-white bg-white p-4 text-sm shadow-[0_12px_26px_rgba(255,131,176,.22)]">
                <div className="font-semibold">Приклад</div>
                <p>Замовлено: вигукнути «Це найкраща ідея, яку я чув сьогодні!» на презентації. Виконавець надає відео‑доказ.</p>
              </div>
              <div className="rounded-xl border border-white bg-white p-4 text-sm shadow-[0_12px_26px_rgba(255,131,176,.22)]">
                <div className="font-semibold">Голосування</div>
                <p>Триває 7 днів або до набрання 101 голосу.</p>
              </div>
              <div className="rounded-xl border border-white bg-white p-4 text-sm shadow-[0_12px_26px_rgba(255,131,176,.22)]">
                <div className="font-semibold">Рішення</div>
                <p>Результат голосування автоматично виконується смартконтрактом.</p>
              </div>
            </div>
            <p>
              BMB нічого не гарантує, не обіцяє і не виступає третьою стороною угоди. Спори вирішують самі учасники системи; ви також голосуєте в інших спорах.
              Тому замовнику й виконавцю варто ґрунтовно обговорити форму виконання.
            </p>
          </div>
        </Card>

        {/* АМБАСАДОРИ */}
        <Card className="mt-8 p-6 md:p-8">
          <SectionTitle title="Амбасадори" subtitle="Реферальна модель і розподіл донатів" />
          <div className="grid gap-6 md:grid-cols-2">
            <div className="prose prose-neutral max-w-none text-[15px]">
              <p>
                Середовище BMB є новим, тендітним і крихким, тож доступ до вільної реєстрації закритий. Ми обираємо Амбасадорів по всьому світу
                з доброзичливою, творчою аудиторією й надаємо їм реферальне слово‑пароль для реєстрації.
              </p>
              <p>
                Усі добровільні донати розподіляються смартконтрактом так: сума донату (100%) → <b>90%</b> виконавцю,
                <b> 10%</b> платформі. Із цих 10%: <b>5%</b> — розвиток BMB, <b>5%</b> — Амбасадору.
              </p>
              <p>
                Наприклад, аудиторія у 1 000 000 людей дізнається про BMB; третина реєструється і донатить між собою хоча б по 10 USDT —
                Амбасадор або автор вірусного відео може отримати 50 000 USDT.
              </p>
            </div>
            {/* Візуал розподілу */}
            <div className="flex flex-col items-center justify-center gap-4">
              <div className="w-full overflow-hidden rounded-xl border border-white bg-white p-4 shadow-[0_12px_26px_rgba(255,131,176,.22)]">
                <div className="text-sm font-semibold mb-2">Розподіл 100% донату</div>
                <div className="relative h-10 w-full overflow-hidden rounded-lg border border-white bg-[#f5f6f8]">
                  <div className="absolute left-0 top-0 h-full" style={{ width: "90%", background: "#ffb5cb" }} />
                  <div className="absolute left-[90%] top-0 h-full" style={{ width: "5%", background: "#e9ebef" }} />
                  <div className="absolute left-[95%] top-0 h-full" style={{ width: "5%", background: "#e9ebef" }} />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded" style={{ background: "#ffb5cb" }}></span> 90% Виконавець</div>
                  <div className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded" style={{ background: "#e9ebef" }}></span> 5% Платформа</div>
                  <div className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded" style={{ background: "#e9ebef" }}></span> 5% Амбасадор</div>
                </div>
              </div>
              <button className="inline-flex items-center gap-2 rounded-full border border-white bg-white px-4 py-2 text-sm font-semibold shadow-[0_10px_24px_rgba(255,131,176,.22)]">
                Стати амбасадором
              </button>
            </div>
          </div>
        </Card>

        {/* ВІДКРИТИЙ КОД */}
        <Card className="mt-8 p-6 md:p-8">
          <SectionTitle title="Відкритий код" />
          <p className="text-[15px] leading-relaxed">
            Buy My Behavior створений з відкритим кодом. Кожен може зайти на GitHub і ознайомитися з архітектурою коду, оцінити захищеність і відкритість.
          </p>
        </Card>

        {/* ЗАСТЕРЕЖЕННЯ */}
        <Card className="mt-8 p-6 md:p-8">
          <SectionTitle title="Застереження" />
          <ul className="grid gap-3 text-[14px]">
            <Bullet>BMB не є постачальником послуг чи платіжною установою — платформа надає інтерфейс і смартконтрактний ескроу.</Bullet>
            <Bullet>BMB не надає юридичних або податкових консультацій; дотримання вимог законодавства щодо благодійних внесків у вашій юрисдикції є відповідальністю користувача.</Bullet>
            <Bullet>Геолокація використовується лише за згодою користувача; видимість і частоту оновлення можна змінити у налаштуваннях профілю.</Bullet>
          </ul>
        </Card>

        {/* КОНТАКТ / CTA (мʼякий, без зміни суті тексту) */}
        <div className="mt-10 flex flex-col items-center gap-3">
          <p className="text-sm text-neutral-600">Щоб отримати реферальне слово, вам слід написати на пошту.</p>
          <button className="inline-flex items-center gap-2 rounded-full border border-white bg-white px-5 py-2.5 text-sm font-bold shadow-[0_14px_28px_rgba(255,131,176,.22)]">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#ff83b0" strokeWidth="2"><path d="M4 4h16v16H4z"/><path d="M4 7l8 6 8-6"/></svg>
            Написати на пошту
          </button>
        </div>
      </main>
    </div>
  );
}
