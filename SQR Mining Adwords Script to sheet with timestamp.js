var CLICKS_THRESHOLD = 50;
var COST_PER_CONVERSION_POSITIVE_THRESHOLD = 150;
var COST_PER_CONVERSION_NEGATIVE_THRESHOLD = 300;
var spreadsheet_url = 'https://docs.google.com/spreadsheets/d/1cExGT5k3p87CysI6fd97xwrSOlSz0OeWK1UmKyUZJ0k/edit#gid=0'
var spreadsheet_rows = SpreadsheetApp.openByUrl(spreadsheet_url)

//Configuration to be used for running reports.
var REPORTING_OPTIONS = {
  apiVersion: 'V201710'
};


//Creating a timestamp
 var newDate = new Date();
    var maybeday = newDate.getDate();
    var maybemonth = newDate.getMonth() + 1;
    var year = newDate.getFullYear();
    if (maybeday < 10) {
      var day = "0" + String(maybeday);
    } else {
      var day = maybeday;
    }
    if (maybemonth < 10) {
      var month = "0" + String(maybemonth);
    } else {
      var month = maybemonth;
    }
    var timestamp = year + "-" + month + "-" + day;




function main() {
  var report = AdWordsApp.report(
      'SELECT  Query, Clicks, Cost, Ctr, CostPerConversion, ConversionRate,' +
      ' Conversions, QueryMatchTypeWithVariant, AdGroupName, CampaignName ' +
      ' FROM SEARCH_QUERY_PERFORMANCE_REPORT ' +
      ' WHERE ' +
          ' Conversions > 0' +
          ' AND Clicks > ' + CLICKS_THRESHOLD +
    	  //' AND CampaignId  = 789129965' +
      ' DURING LAST_7_DAYS', REPORTING_OPTIONS);
  var rows = report.rows();

  var negativeKeywords = {};
  var positiveKeywords = {};
  var positiveNegativeKeywords = {};
  var allAdGroupNames = {};
  var negativesToSheet = []
  var positivesToSheet = []
  // Iterate through SQR and decide whether to add them as positive or negative keyword
  while (rows.hasNext()) {
    var row = rows.next();
    if (parseFloat(row['CostPerConversion']) > COST_PER_CONVERSION_NEGATIVE_THRESHOLD) {
      Logger.log("Negative: " + row['AdGroupName'] + " - " + row['Query']);
      addToMultiMap(negativeKeywords, row['AdGroupName'].replace("BMM", "Exact"), row['Query']);
      allAdGroupNames[row['AdGroupName']] = true;
      negativesToSheet.push([
        timestamp,
        row['Query'],
        row['QueryMatchTypeWithVariant'],
        row['CampaignName'],
        row['AdGroupName'],
      ]);
    } else if (parseFloat(row['CostPerConversion']) <
        COST_PER_CONVERSION_POSITIVE_THRESHOLD && row['QueryMatchTypeWithVariant'] != 'exact') {
      Logger.log("Postive: " + row['AdGroupName'] + " - " +  row['Query']);
      addToMultiMap(positiveKeywords, row['AdGroupName'].replace("BMM", "Exact"), row['Query']);
      addToMultiMap(positiveNegativeKeywords, row['AdGroupName'].replace("Exact", "BMM"), row['Query']);
      allAdGroupNames[row['AdGroupName']] = true;
      positivesToSheet.push([
        timestamp,
        row['Query'],
        row['QueryMatchTypeWithVariant'],
        row['CampaignName'],
        row['AdGroupName'],
      ]);
    }
  }

  //writing to spreadsheets
	Logger.log(positivesToSheet);

 // Logger.log(row['QueryMatchTypeWithVariant']);
  //Logger.log(positiveNegativeKeywords);
  // Copy all the adGroupIds from the object into an array.
  var adGroupNameList = [];
  for (var AdGroupName in allAdGroupNames) {
    var newAdGroupName = AdGroupName.replace("BMM", "Exact");
    adGroupNameList.push(newAdGroupName);
  }
  Logger.log(positiveKeywords);
// Add the keywords as negative or positive to the applicable ad groups.
  var adGroups = AdWordsApp.adGroups().withCondition("Status = ENABLED").withCondition("Clicks > 3").forDateRange("LAST_30_DAYS").get();
  while (adGroups.hasNext()) {
    var adGroup = adGroups.next();
     // Logger.log(adGroup.getName());

    if (negativeKeywords[adGroup.getName()]) {
      for (var i = 0; i < negativeKeywords[adGroup.getName()].length; i++) {
        adGroup.createNegativeKeyword(
            '[' + negativeKeywords[adGroup.getName()][i] + ']');
      }
    }

    if (positiveNegativeKeywords[adGroup.getName()]) {
      for (var i = 0; i < positiveNegativeKeywords[adGroup.getName()].length; i++) {
        adGroup.createNegativeKeyword(
            '[' + positiveNegativeKeywords[adGroup.getName()][i] + ']');
      }
    }
    if (positiveKeywords[adGroup.getName()]) {

      var existingKeywords = adGroup.keywords();
      var keywordIterator = existingKeywords.get();
      var existingKeywordsText = [];
          while (keywordIterator.hasNext()) {
              var keyword = keywordIterator.next();
              var keywordText = keyword.getText();
              existingKeywordsText.push(keywordText);
          }
      //Logger.log(existingKeywordsText);

      for (var i = 0; i < positiveKeywords[adGroup.getName()].length; i++) {
        if (positiveKeywords[adGroup.getName()][i] !== positiveKeywords[adGroup.getName()][i-1] && existingKeywordsText.indexOf('[' + positiveKeywords[adGroup.getName()][i] + ']') === -1)  {
          var keywordOperation = adGroup.newKeywordBuilder()
              .withText('[' + positiveKeywords[adGroup.getName()][i] + ']')
              .withFinalUrl("https://www.safelite.com")
              .build();
          var keyword = keywordOperation.getResult();
          ////keyword.applyLabel('SQR');
        }
      }
    }
  }
  if (negativesToSheet.length > 0) {
    writeToSpreadsheet(negativesToSheet, 'negatives')
  }

  if (positivesToSheet.length > 0) {
    writeToSpreadsheet(positivesToSheet, 'positives')
  }
}

function addToMultiMap(map, key, value) {
  if (!map[key]) {
    map[key] = [];
  }
  map[key].push(value);
}

/**
 * Append the data rows to the spreadsheet.
 *
 * @param {Array<Array<string>>} rows The data rows.
 */
function writeToSpreadsheet(rows, sheet) {
  var access = new SpreadsheetAccess(spreadsheet_url, sheet.toLowerCase());
  var emptyRow = access.findEmptyRow(1, 1);
  if (emptyRow < 0) {
    access.addRows(rows.length);
    emptyRow = access.findEmptyRow(1, 1);
  }
  access.writeRows(rows, emptyRow, 1);
}

function SpreadsheetAccess(spreadsheetUrl, sheetName) {
  this.spreadsheet = SpreadsheetApp.openByUrl(spreadsheetUrl);
  this.sheet = this.spreadsheet.getSheetByName(sheetName);

  // what column should we be looking at to check whether the row is empty?
  this.findEmptyRow = function(minRow, column) {
    var values = this.sheet.getRange(minRow, column,
        this.sheet.getMaxRows(), 1).getValues();
    for (var i = 0; i < values.length; i++) {
      if (!values[i][0]) {
        return i + minRow;
      }
    }
    return -1;
  };
  this.addRows = function(howMany) {
    this.sheet.insertRowsAfter(this.sheet.getMaxRows(), howMany);
  };
  this.writeRows = function(rows, startRow, startColumn) {
    this.sheet.getRange(startRow, startColumn, rows.length, rows[0].length).
        setValues(rows);
  };
}
