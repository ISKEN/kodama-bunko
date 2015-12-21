// Models
var Copy = Parse.Object.extend("Copy", {
    // Instance methods,
 	borrow: function(memberId) {
 		var copy = this;
 		return copy.canBorrow()
	 		.then(function() {
	 			return Member.get(memberId);
	 		})
	 		.then(function(member) {
				var Transaction = Parse.Object.extend("Transaction");
				var transaction = new Transaction();
				transaction.set("effectiveDate", new Date());
				transaction.set("transactionType", "貸出");
				transaction.set("member", member);
				transaction.set("copy", copy);
				return transaction.save();
	 		});
 	},
 	canBorrow: function() {
 		return this.getStatus()
 			.then(function(status) {
				if (status == "未在庫" || status == "在庫中") { 
					return true;
				}
				return Parse.Promise.error("貸出できません。");
 			});
    },
    return: function(placeId) {
    	var copy = this;
    	return copy.canReturn()
    		.then(function() {
    			return Place.get(placeId);
    		})
    		.then(function(place) {
				var Transaction = Parse.Object.extend("Transaction");
				var transaction = new Transaction();
				transaction.set("effectiveDate", new Date());
				transaction.set("transactionType", "返却");
				transaction.set("place", place);
				transaction.set("copy", copy);
				return transaction.save();
    		});
    },
    canReturn: function() {
    	return this.getStatus()
	    	.then(function(status) {
	    		if (status == "貸出中") {
	    			return true;
	    		}
				return Parse.Promise.error("返却できません。");
	    	});
    },
    move: function(placeId) {
    	var copy = this;
    	return copy.canMove()
    		.then(function() {
    			return Place.get(placeId);
    		})
    		.then(function(place) {
				var Transaction = Parse.Object.extend("Transaction");
				var transaction = new Transaction();
				transaction.set("effectiveDate", new Date());
				transaction.set("transactionType", "移動");
				transaction.set("place", place);
				transaction.set("copy", copy);
				return transaction.save();
    		});
    },
    canMove: function() {
    	return this.getStatus()
	    	.then(function(status) {
	    		if (status == "未在庫" || status == "在庫中") {
	    			return true;
	    		}
				return Parse.Promise.error("移動できません。");
	    	});
    },
    getStatus: function() {
		var Transaction = Parse.Object.extend("Transaction");
		var query = new Parse.Query(Transaction);
	   	query.equalTo("copy", this);
    	query.limit(1);
		query.descending("effectiveDate");
 		return query.first()
 			.then(function(transaction) {
 				var type = transaction == null 
 						? "" : transaction.get("transactionType");
 				return Copy.toStatus(type);
 			});
    }
}, {
	// Class properties
 	get: function(copyId) {
		var Copy = Parse.Object.extend("Copy");
		var query = new Parse.Query(Copy);
		return query.get(copyId);
 	},
 	toStatus: function(type) {
 		if (type == "") { return "未在庫"; }
 		if (type == "貸出") { return "貸出中"; }
 		if (type == "移動" || type == "返却") { return "在庫中"; }
 		if (type == "削除" ) { return "削除済"; }
 		return Parse.Promise.error("想定されていない種別です。");
 	}
});
var Member = Parse.Object.extend("Member", {
    // Instance methods,
}, {
	// Class properties
 	get: function(memberId) {
		var Member = Parse.Object.extend("Member");
		var query = new Parse.Query(Member);
		return query.get(memberId);
 	}
});
var Place = Parse.Object.extend("Place", {
    // Instance methods,
}, {
	// Class properties
 	get: function(placeId) {
		var Place = Parse.Object.extend("Place");
		var query = new Parse.Query(Place);
		return query.get(placeId);
 	}
});


/**
 * 貸出の記録
 * @param {string} copyId - Copy.objectId
 * @param {string} memberId - Member.objectId
 */
Parse.Cloud.define("borrow", function(request, response) {
	var copyId = request.params.copyId;
	var memberId = request.params.memberId;
	Copy.get(copyId)
		.then(function(copy){
			return copy.borrow(memberId);
		})
		.then(function(transaction) {
			response.success("貸出OK");				
		}, function(error) {
			response.error(error);
		});
});

/**
 * 入庫の記録（返却、移動）
 * @param {string} copyId - Copy.objectId
 * @param {string} locationId - Location.objectId
 */
Parse.Cloud.define("putin", function(request, response) {
	var copyId = request.params.copyId;
	var placeId = request.params.placeId;
	Copy.get(copyId)
		.then(function(copy) {
			return copy.getStatus();
		})
		.then(function(status) {
			if (status == "貸出中") {
				// 再検索するのが気持ち悪い
				return Copy.get(copyId)
				.then(function(copy) {
					return copy.return(placeId);
				});
			}
			// それ以外の場合は移動
			return Copy.get(copyId)
			.then(function(copy) {
				return copy.move(placeId);
			});
		})
		.then(function(transaction) {
			response.success(transaction.get("transactionType") + "OK");
		}, function(error) {
			response.error(error);
		});
});

/**
 * 蔵書の取得
 * @param {string} itemNo
 */
Parse.Cloud.define("getCopy", function(request, response) {
	var Copy = Parse.Object.extend("Copy");
	var query = new Parse.Query(Copy);
	query.equalTo("bookNo", request.params.bookNo);
	return query.find({
		success: function(results){
			if(results.length == 0) {
				response.error("蔵書が登録されていません。");
			} else {
				response.success(results[0]);
			}
		},
		error: function(error) {
			response.error(error);
		}
	});
});

/**
 * 蔵書の検索
 * @param {string} keyword
 */
Parse.Cloud.define("findCopy", function(request, response) {
	var query = new Parse.Query(Copy);
	var keywords = request.params.keywords;
	for (var i = 0; i < keywords.length; i++) {
		if (keywords[i] == "") continue;
		query.matches("attributes", ".*" + keywords[i] + ".*");
	};
//	var data = new Array();
	query.find()
		.then(function(copies) {
			response.success(copies);
		}, function(error) {
			response.error(error);			
		});
});

/**
 * 場所の検索
 * @param {string} placeNo - Place.placeNo
 */
Parse.Cloud.define("getPlace", function(request, response) {
	var placeNo = request.params.placeNo;
	var Place = Parse.Object.extend("Place");
	var query = new Parse.Query(Place);
	query.equalTo("placeNo", placeNo);
	query.find({
		success: function(results) {
			if (results.length == 0) {
				response.error("保管場所が登録されていません。");
			} else {
				response.success(results[0]);
			}
	  	},
		error: function(error) {
			response.error(error);
		}
	});
});

/**
 * 会員の検索
 * @param {string} memberNo - Member.memberNo
 */
Parse.Cloud.define("getMember", function(request, response) {
	var memberNo = request.params.memberNo;
	var Member = Parse.Object.extend("Member");
	var query = new Parse.Query(Member);
	query.equalTo("memberNo", memberNo);
	query.find({
		success: function(results) {
			// 登録されていなければエラー
			if (results.length == 0) {
				response.error("会員が登録されていません。");
			} else {
				response.success(results[0]);
			}
	  	},
		error: function(error) {
			response.error(error);
		}
	});
});


/**
 * 蔵書の登録
 * @param {string} bookNo - 
 * @param {string} memberId
 * @param {string} placeId 
 */
Parse.Cloud.define("addCopy", function(request, response) {
	var memberId = request.params.memberId;
	var placeId = request.params.placeId;
	var bookNo = request.params.bookNo;
	
	var Copy = Parse.Object.extend("Copy");
	var query = new Parse.Query(Copy);
	query.equalTo("bookNo", bookNo);
	query.find({
		success: function(results){
			console.log("results -->" + results);
			if(results.length == 0) {
				console.log("getBookNo is none");
				var _bookInfo = getGoogleBookInfo(bookNo);
				var attributes = parseAttributes(_bookInfo);
				var copy = new Copy();
				copy.set("bookNo", bookNo);
				copy.set("attributes", attributes);
				copy.save();
          		response.success("OK");
			} else {
				console.log("Exist Book(s).");
				response.error("既に蔵書が登録されています。");
			}
		},
		error: function(error) {
      		console.log("getBookNo is error");
			response.error(error);
		}
	});
  });

getGoogleBookInfo = function(isbn) {
	return Parse.Cloud.httpRequest({
		url: "https://www.googleapis.com/books/v1/volumes?q=isbn:" + isbn
	});
};

getAmazonBookInfo = function(isbn) {
	var jsSHA = require('cloud/sha256.js');
	var url = "http://ecs.amazonaws.jp/onca/xml?";
	var para = {
		Service:"AWSECommerceService",
		Version:"2011-08-01",
		Operation:"ItemLookup",
		SearchIndex:"Books",
		AssociateTag : "KodamaBunko555",
		ItemId: isbn,
		Timestamp:new Date().toISOString(),
		AWSAccessKeyId:"", // AWSに怒られたので、一旦消す。。
		IdType:"ISBN",
		ResponseGroup:"ItemAttributes"
	};
	var para_array = [];
	for(var pname in para){
		para_array.push(pname + "=" + encodeURIComponent(para[pname]));
	}
	para_array.sort();
	var str_para = para_array.join('&');
	var str_signature = "GET" + "\n" + "ecs.amazonaws.jp" + "\n" + "/onca/xml" + "\n" + str_para;
	var shaObj = new jsSHA("SHA-256", "TEXT");
	shaObj.setHMACKey("oQYufranEHIyKuTC4MyXzuciwKyppr6rkSiPFo7N", "TEXT");
	shaObj.update(str_signature);
	var signature = shaObj.getHMAC("B64");
	var z = url + str_para + "&Signature=" + signature;

	return Parse.Cloud.httpRequest({ url: z });
};

parseAttributes = function(attributes) {
	return "Test";
};
