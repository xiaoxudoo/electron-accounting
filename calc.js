const ml = require('ml-regression')
const csv = require('csvtojson')
const SLR = ml.SLR // Simple Linear Regression
const csvFilePath = './data.csv' // Data
const YEAR = 2010 // 观测数据发现 基本都是2007 ~ 2010, 只能计算2010年的可比性，所有数据都要参与计算。
const companyDataMap = new Map() // 将数据按照公司归类
const nindnmeMap = new Map() // 将公司按照行业归类
const coefficientMap = new Map() // 每个公司的回归系数
const SCALE = 100 // 最后数值的缩放比例，取倒数
csv({ delimiter: ';' })
  .fromFile(csvFilePath)
  .then((jsonArray) => {
    // 将数据按公司分类
    for (let i = 0, len = jsonArray.length; i < len; i++) {
      const json = jsonArray[i]
      if (companyDataMap.has(json.id)) {
        companyDataMap.get(json.id).data.push(json)
      } else {
        companyDataMap.set(json.id, {nindnme: json.Nindnme, data: [json]})
      }
    }
    console.log('删除小于4年的无效数据:')
    console.log(`删除前的数据量为${companyDataMap.size}`)
    // 如果数据没有超过4年，则剔除
    for (let [key, value] of companyDataMap) {
      if (value.data.length < 16) {
        companyDataMap.delete(key)
      }
    }
    console.log(`删除后的数据量为${companyDataMap.size}`)
    // 先计算出所有组数据的回归系数
    for (let [key, value] of companyDataMap) {
      const x = []
      const y = []
      const reserveArr = []
      for (let i = 0, len = value.data.length; i < len; i++) {
        const row = value.data[i]
        if (!isNaN(row.earning1) && !isNaN(row.returnSe)) {
          if (row.earning1 != 0 && row.earning1 != '' && row.returnSe != 0 && row.returnSe != '') {
            row.returnSe = f(row.returnSe)
            row.earning1 = f(row.earning1)
            x.push(row.returnSe)
            y.push(row.earning1)
            reserveArr.push(row)
          }
        }
      }
      value.data = reserveArr
      if (x.length < 2) {
        companyDataMap.delete(key)
        continue
      }
      const coefficient = performRegression(x, y)
      coefficientMap.set(key, coefficient)
    }
    // 将公司按行业归类
    for (let [key, value] of companyDataMap) {
      const nindnme = value.nindnme
      if (nindnmeMap.has(nindnme)) {
        nindnmeMap.get(nindnme).push(key)
      } else {
        nindnmeMap.set(nindnme, [key])
      }
    }
    console.log('删除只有1个公司的行业:')
    console.log(`删除前的数据量为${nindnmeMap.size}`)
    for (let [key, value] of nindnmeMap) {
      if (value.length < 2) {
        nindnmeMap.delete(key)
        companyDataMap.delete(value[0])
      }
    }
    console.log(`删除后的数据量为${nindnmeMap.size}`)
    // 开始计算2010年的会计可比性
    // 假设数据都是严格按照年份顺序排列的 2007 ~ 2010， 1~4季度
    const _earningArray = calculateAllEarning('2')
    console.log(_earningArray)
    // for (let key of companyDataMap.keys()) {
    //   console.log(key)
    //   const _earningArray = calculateAllEarning(key)
    //   k4_average(_earningArray)
    // }
  })

function performRegression (x, y) {
  const regressionModel = new SLR(x, y) // Train the model on training data
  // console.log(regressionModel.coefficients[1])
  return regressionModel.coefficients
}

function calculateAllEarning (id) {
  const earningArray = []
  const _thisCompanyData = companyDataMap.get(id).data
  const _thisNindnme = companyDataMap.get(id).nindnme
  const companies = nindnmeMap.get(_thisNindnme)
  const _thisEarnig = calculateEarning(_thisCompanyData, id)
  for (let i = 0, len = companies.length; i < len; i++) {
    if (companies[i] == id) continue
    const _earning = calculateEarning(_thisCompanyData, companies[i])
    earningArray.push(absoluteDistance(_earning, _thisEarnig))
  }
  return earningArray
}

// data: 公司数据 id: 需要计算的公司ID
function calculateEarning (data, id) {
  const earning = []
  const coefficient = coefficientMap.get(id)
  const intercept = coefficient[0] // y = slope * x + intercept;
  const slope = coefficient[1]
  for (let i = 0, len = data.length; i < len; i++) {
    const _earning = data[i].returnSe * slope + intercept
    earning.push(_earning)
  }
  return earning
}

function absoluteDistance (arr1, arr2) {
  let sum = 0
  if (arr1.length != arr2.length) { console.log('compare error...'); throw new Error('data length error') }
  for (let i = 0, len = arr1.length; i < len; i++) {
    sum += Math.abs(arr1[i] - arr2[i])
  }
  // if (arr1.length != 16) { console.log('warn: length is short') }
  return (-1 / arr1.length) * sum
}

function f (s) {
  return parseFloat(s)
}

function average (values) {
  let sum = values.reduce((previous, current) => current += previous)
  let avg = sum / values.length
  console.log(avg)
  return avg
}

function median (values) {
  values.sort((a, b) => a - b)
  let median = (values[(values.length - 1) >> 1] + values[values.length >> 1]) / 2
  console.log(median)
  return median
}

function k4_average (values) {
  values.sort((a, b) => b - a)
  const k4_average = average(values.slice(0, 4))
  return k4_average
}
