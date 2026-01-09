# Load model directly
from transformers import AutoTokenizer, AutoModelForCausalLM
import pandas as pd

df = pd.read_csv("news_with_issue1212.csv")
print(df.head(5))
df = df.dropna(subset=['title', 'text'])

tokenizer = AutoTokenizer.from_pretrained("Qwen/Qwen2.5-3B-Instruct")
model = AutoModelForCausalLM.from_pretrained("Qwen/Qwen2.5-3B-Instruct")
text = "LG전자는 2일 서울 강서구 LG사이언스파크에서 상생결제시스템 성과와 확산 방안을 논의하는 간담회를 열었다고 밝혔다. 이날 행사에는 권칠승 중소벤처기업부 장관을 비롯해 LG전자 재무담당최고책임자(CFO) 배두용 부사장, LG전자 협력사 4곳 대표 등이 참석했다. 간담회에서 2차 이하 협력사를 위해 결제환경을 개선한 LG전자의 상생결제 시스템 사례를 공유하고, 향후 상생결제 확산 방안을 논의했다. 상생결제 시스템은 대기업이 제3의 금융기관을 거쳐 협력사에 물품 대금을 지급하는 결제방식으로, 1차 협력사를 비롯해 2·3차 이하 협력사들도 제때 대금을 받을 수 있게 했다. 또 2·3차 협력사가 결제일 이전에 대기업 신용을 바탕으로 해당 금융기관을 통해 물품 대금을 조기에 현금화할 수 있다. LG전자는 올해 초 상생결제시스템을 확산시킨 공로를 인정받아 대·중소기업·농어업협력재단으로부터 '상생결제 우수기업'으로 선정됐다. 앞서 2010년부터는 기업은행, 산업은행 등과 함께 2000억원 규모의 상생협력펀드를 운영하며 협력사가 자금이 필요할 때 저금리 대출을 받을 수 있도록 지원하고 있다. 이시용 LG전자 구매·SCM경영센터장(전무)은 \상생결제를 확산시켜 협력사가 안정적으로 회사를 운영하는 데 도움이 됐으면 한다\며 \협력사들과 함께 성장할 수 있도록 상생 결제를 위한 지원을 아끼지 않고 지속해서 노력할 것\이라고 강조했다."
messages = [
    {
        "role": "system",
        "content": (
            "너는 한국어 경제 뉴스 분석 모델이다."
            "기사에서 핵심 주장 1개와 근거를 추출하라."
            "핵심주장은 기사 제목과 연관성이 있게 찾아라."
        )
    },
    {
        "role": "user",
        "content": (
            "기사 제목 : "
            + "LG전자, 중기부와 상생결제시스템 확산 방안 간담회"
            + "기사 본문 : "
            + text
        )
    }
]
inputs = tokenizer.apply_chat_template(
	messages,
	add_generation_prompt=True,
	tokenize=True,
	return_dict=True,
	return_tensors="pt",
).to(model.device)

outputs = model.generate(**inputs, max_new_tokens=400)
print(tokenizer.decode(outputs[0][inputs["input_ids"].shape[-1]:]))