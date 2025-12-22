# Logger 를 여기서 설정하고 필요한 곳에서 가져다 쓰게 해보자
import logging

# 누군가가 Logger 클래스를 객체화 하면...
class Logger:
    # logging 이 설정이 된다.
    logging.basicConfig(
        level=logging.INFO,
        format='%(levelname)s: [%(name)s] %(message)s -%(asctime)s',
        datefmt='%H:%M:%S'
    )

    # 아래 함수를 실행 시 모듈의 이름을 주면 로거객체를 생성해 반환한다.
    def get_logger(self,name):
        return logging.getLogger(name)