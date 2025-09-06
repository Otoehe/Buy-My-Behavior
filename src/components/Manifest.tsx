import React from 'react';
import './Manifest.css';

export default function Manifest() {
  // ── UI tokens (адитивно; без зміни існуючого CSS) ─────────────────────────────
  const PINK = '#ffcdd6';
  const PINK_SOFT = '#ffeef3';
  const BLACK = '#000000';
  const BORDER = 'rgba(0,0,0,0.06)';

  const styles: Record<string, React.CSSProperties> = {
    pageFont: {
      // Використати той самий шрифт, що й у навігації (через CSS-змінну)
      fontFamily: 'var(--nav-font, inherit)',
      color: BLACK,
    },
    hero: {
      backgroundImage: `
        radial-gradient(1200px 420px at 12% -12%, ${PINK_SOFT}, transparent 55%),
        linear-gradient(180deg, #ffffff 0%, ${PINK_SOFT} 100%)
      `,
      border: `1px solid ${BORDER}`,
      borderRadius: 28,
      boxShadow: '0 12px 28px rgba(0,0,0,0.06)',
      padding: '36px 22px 28px',
      margin: '0 auto',
      maxWidth: 1120,
    },
    kicker: {
      display: 'inline-block',
      padding: '6px 12px',
      borderRadius: 999,
      background: '#ffffff',
      border: `1px solid ${BORDER}`,
      boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
      fontSize: 'clamp(12px, 2.4vw, 14px)',
      fontWeight: 600,
      letterSpacing: '0.02em',
      marginBottom: 12,
    },
    title: {
      margin: 0,
      fontWeight: 800,
      letterSpacing: '-0.02em',
      lineHeight: 1.1,
      fontSize: 'clamp(28px, 6.2vw, 56px)',
      textShadow: '0 1px 0 rgba(255,255,255,0.6)',
    },
    divider: {
      height: 1,
      background: 'linear-gradient(90deg, transparent, rgba(0,0,0,0.06), transparent)',
      margin: '16px 0 12px',
    },
    lead: {
      margin: 0,
      fontSize: 'clamp(14px, 2.8vw, 18px)',
      lineHeight: 1.6,
      opacity: 0.9,
    },
    pills: {
      display: 'flex',
      gap: 8,
      flexWrap: 'wrap',
      marginTop: 14,
    },
    pill: {
      display: 'inline-block',
      padding: '8px 12px',
      borderRadius: 999,
      background: '#fff',
      border: `1px solid ${BORDER}`,
      fontSize: 'clamp(12px, 2.6vw, 14px)',
      fontWeight: 600,
      boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
    },
    shelf: {
      height: 10,
      margin: '0 10px',
      background: `linear-gradient(180deg, rgba(0,0,0,0.06), transparent 70%)`,
      borderRadius: '0 0 24px 24px',
      filter: 'blur(6px)',
      transform: 'translateY(-8px)',
      opacity: 0.4,
      maxWidth: 1120,
    },
  };

  return (
    <div className="mf-page" style={styles.pageFont}>
      {/* HERO */}
      <header className="mf-hero" aria-label="Маніфест Buy My Behavior">
        <div className="mf-container" style={styles.hero}>
          {/* легкий “кікер” замість бейджа BMB */}
          <span style={styles.kicker}>Маніфест</span>

          {/* повна назва замість «BMB» */}
          <h1 className="mf-hero-title" style={styles.title}>
            Маніфест Buy My Behavior
          </h1>

          <div style={styles.divider} />

          <p className="mf-hero-lead" style={styles.lead}>
            Buy My Behavior — цифровий Web3-простір, де люди обмінюються сценаріями поведінки,
            узгоджують умови та захищають угоди ескроу-смартконтрактом.
          </p>

          {/* акуратні піллі з мікротінню */}
          <div className="mf-pills" style={styles.pills}>
            <span className="mf-pill" style={styles.pill}>Web3</span>
            <span className="mf-pill" style={styles.pill}>Escrow Smart-Contract</span>
            <span className="mf-pill" style={styles.pill}>Open Source</span>
          </div>
        </div>

        {/* оптична “полиця” для стабільності блоку */}
        <div style={styles.shelf} aria-hidden="true" />
      </header>

      <main className="mf-container mf-main">
        {/* ЩО ТАКЕ BMB */}
        <section className="mf-card">
          <h2 className="mf-section-title">Що таке BMB</h2>
          <div className="mf-prose">
            <p>
              Buy My Behavior — це цифровий Web3-простір, де люди обмінюються між собою сценаріями
              поведінки. До сьогодні еволюція не дала нам можливості моделювати поведінку інших людей,
              читати їхні думки й ідеально взаємодіяти між собою.
            </p>
            <p>
              Дружнє середовище взаємних вчинків BMB дозволяє вам моделювати поведінку навколишніх людей
              з описом того, як саме людина має себе поводити — щоб для вас це було ідеальною комунікацією:
              де саме, в який час, які обставини й контекст огортають цю подію. Уявіть, що ви створюєте
              ідеальний фільм свого життя з акторів — незнайомих людей навколо. А ви самі також можете
              стати учасником цікавої історії, яку пише інша людина.
            </p>
            <p>
              BMB запропонував створювати обмін поведінкою як безкоштовний енергетичний обмін між учасниками.
              Водночас ми дозволили висловити благодійну подяку виконавцю в USDT — на підтримку його креативності,
              запису ще цікавіших біхейворсів та просто для вираження вдячності за добрі вчинки. У якій би країні ви
              не користувалися BMB, ви повинні розуміти, що не надаєте послуги, а безкоштовно обмінюєтеся сценаріями
              поведінки та виконуєте їх за бажанням.
            </p>
            <p>
              Під час реєстрації ви проходите KYC, і ми відкриваємо вам можливість отримувати благодійні внески
              в розмірі <b>до 1 000 USDT за одну угоду</b>. Якщо ви знаменита людина і ваша поведінка — це щось
              дійсно величне, ви можете пройти глибший KYC — тоді сума ваших благодійних донатів-подяк становитиме
              <b> до 10 000 USDT за одну угоду</b>.
            </p>
            <p>
              Середовище BMB під’єднує ваш криптогаманець MetaMask і проводить ескроу-смартконтракт на захищеному
              з’єднанні. Ми не маємо доступу до ваших ключів — усі угоди проходять ескроу-смартконтрактом. Buy My Behavior
              створений з відкритим кодом. Кожен може зайти на GitHub і ознайомитися з архітектурою коду, оцінити
              захищеність і відкритість.
            </p>
          </div>
        </section>

        {/* ЯК ЦЕ ПРАЦЮЄ + ЗАМОВЛЕННЯ */}
        <section className="mf-grid-2">
          <div className="mf-card">
            <h2 className="mf-section-title">Як це працює</h2>
            <ol className="mf-steps">
              <li>
                Отримавши реферальне слово від Амбасадора BMB, ви реєструєтесь і потрапляєте на сторінку «Профіль»,
                де заповнюєте інформацію про себе, під’єднуєте MetaMask і проходите KYC.
              </li>
              <li>Опишіть, у чому ви сильні та які життєві комбінації здатні втілити. Люди моделюють із вас свої сценарії.</li>
              <li>
                За згодою користувача відображається геопозиція (видимість можна вимкнути/обмежити). Карта працює в реальному часі.
              </li>
              <li>
                Оберіть виконавця → натисніть «Замовити поведінку» → узгодьте опис сценарію, час/дату/локацію та, за бажання,
                суму донату.
              </li>
              <li>
                Після «Погодити угоду» ескроу-смартконтракт блокує донат на гаманці замовника. Після виконання — переказує його автоматично.
              </li>
            </ol>
          </div>

          <div className="mf-card">
            <h2 className="mf-section-title">Замовлення</h2>
            <ul className="mf-bullets">
              <li>Опишіть сценарій і важливі нюанси ідеальної взаємодії.</li>
              <li>Вкажіть час і дату, оберіть місце на карті.</li>
              <li>За бажанням додайте суму донату в USDT для підтримки творчості виконавця.</li>
            </ul>
          </div>
        </section>

        {/* ЕЛЕМЕНТ СПОРУ */}
        <section className="mf-card">
          <h2 className="mf-section-title">Елемент спору</h2>
          <div className="mf-prose">
            <p>
              Якщо замовник не впевнений у виконанні, він може натиснути «Оскаржити виконання». Умикається смартконтракт спору.
              Виконавець завантажує біхейворс-доказ. Чи відправляти кошти виконавцю — вирішують учасники BMB через голосування
              на сторінці «Вибрати виконавця».
            </p>
          </div>

          <div className="mf-grid-3 mf-cards">
            <div className="mf-subcard">
              <div className="mf-subcard-title">Приклад</div>
              <p>Замовлено: вигукнути «Це найкраща ідея, яку я чув сьогодні!» на презентації. Виконавець надає відео-доказ.</p>
            </div>
            <div className="mf-subcard">
              <div className="mf-subcard-title">Голосування</div>
              <p>Триває 7 днів або до набрання 101 голосу.</p>
            </div>
            <div className="mf-subcard">
              <div className="mf-subcard-title">Рішення</div>
              <p>Результат голосування автоматично виконується смартконтрактом.</p>
            </div>
          </div>

          <div className="mf-prose">
            <p>
              BMB нічого не гарантує, не обіцяє і не виступає третьою стороною угоди. Спори вирішують самі учасники; тому
              замовнику й виконавцю варто ґрунтовно обговорити форму виконання.
            </p>
          </div>
        </section>

        {/* АМБАСАДОРИ */}
        <section className="mf-card">
          <h2 className="mf-section-title">Амбасадори</h2>
          <div className="mf-grid-2 mf-col-gap">
            <div className="mf-prose">
              <p>
                Середовище BMB є новим, тож вільну реєстрацію закрито. Ми обираємо Амбасадорів із доброзичливою, творчою
                аудиторією й надаємо їм реферальне слово-пароль для реєстрації.
              </p>
              <p>
                Усі добровільні донати розподіляються смартконтрактом так: сума донату (100%) → <b>90%</b> виконавцю,
                <b> 10%</b> платформі. Із цих 10%: <b>5%</b> — розвиток BMB, <b>5%</b> — Амбасадору.
              </p>
              <p>
                Наприклад, аудиторія в 1 000 000 людей дізнається про BMB; третина реєструється та донатить між собою хоча б по 10 USDT —
                Амбасадор або автор вірусного відео може отримати 50 000 USDT.
              </p>
            </div>

            <div>
              <div className="mf-subcard">
                <div className="mf-subcard-title">Розподіл 100% донату</div>
                <div className="mf-bar">
                  <div className="mf-bar-exec" style={{ width: '90%' }} />
                  <div className="mf-bar-gray" style={{ left: '90%', width: '5%' }} />
                  <div className="mf-bar-gray" style={{ left: '95%', width: '5%' }} />
                </div>
                <div className="mf-legend">
                  <span><i className="mf-dot mf-dot-pink" /> 90% Виконавець</span>
                  <span><i className="mf-dot mf-dot-gray" /> 5% Платформа</span>
                  <span><i className="mf-dot mf-dot-gray" /> 5% Амбасадор</span>
                </div>
              </div>
              <button className="mf-ghost-btn">Стати амбасадором</button>
            </div>
          </div>
        </section>

        {/* ВІДКРИТИЙ КОД */}
        <section className="mf-card">
          <h2 className="mf-section-title">Відкритий код</h2>
          <p className="mf-prose">
            Buy My Behavior створений з відкритим кодом. Кожен може зайти на GitHub і ознайомитися з архітектурою коду, оцінити
            захищеність і відкритість.
          </p>
        </section>

        {/* ЗАСТЕРЕЖЕННЯ */}
        <section className="mf-card">
          <h2 className="mf-section-title">Застереження</h2>
          <ul className="mf-bullets">
            <li>BMB не є постачальником послуг чи платіжною установою — ми надаємо інтерфейс і смартконтрактний ескроу.</li>
            <li>BMB не надає юридичних або податкових консультацій; дотримання місцевих норм — відповідальність користувача.</li>
            <li>Геолокація використовується лише за згодою користувача; видимість та частоту оновлення можна змінити в профілі.</li>
          </ul>

          <div className="mf-cta">
            <p className="mf-cta-note">Щоб отримати реферальне слово, вам слід написати на пошту.</p>
            <button className="mf-ghost-btn">
              ✉️ Написати на пошту
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
