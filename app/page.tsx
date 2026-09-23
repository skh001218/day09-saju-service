import SajuForm from "./saju-form";

export default function Page() {
  return (
    <main>
      <header className="page-header">
        <h1>내 사주를 확인해보세요.</h1>
        <p className="intro">
          생년월일과 태어난 시간을 입력하면 기본 사주를 계산합니다.
        </p>
      </header>
      <SajuForm />
    </main>
  );
}
