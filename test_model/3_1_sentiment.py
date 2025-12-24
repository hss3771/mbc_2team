import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
from sklearn.model_selection import train_test_split
import re
import urllib.request
# import mecab
from tqdm import tqdm
from tensorflow.keras.preprocessing.text import Tokenizer
from tensorflow.keras.preprocessing.sequence import pad_sequences

urllib.request.urlretrieve("https://raw.githubusercontent.com/ukairia777/finance_sentiment_corpus/main/finance_data.csv", filename="finance_data.csv")


data = pd.read_csv('finance_data.csv')
print('총 샘플의 수 :',len(data))

data['labels'] = data['labels'].replace(['neutral', 'positive', 'negative'],[0, 1, 2])
print(data[:5])
del data['sentence']
print('결측값 여부 :',data.isnull().values.any())
print('kor_sentence 열의 유니크한 값 :',data['kor_sentence'].nunique())
duplicate = data[data.duplicated()]

data.drop_duplicates(subset=['kor_sentence'], inplace=True)
print('총 샘플의 수 :',len(data))

data['labels'].value_counts().plot(kind='bar')