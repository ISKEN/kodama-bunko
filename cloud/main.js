/**
 * 保有の登録
 * @param {string} itemNo - Item.itemNo
 * @param {string} locationId - Location.objectId
 */
Parse.Cloud.define("addHolding", function(request, response) {
	var itemNo = request.params.itemNo;
	var locationId = request.params.locationId;
	// 書籍を検索する
	var Item = Parse.Object.extend("Item");
	var query = new Parse.Query(Item);
	query.equalTo("itemNo", itemNo);
	query.find({
		success: function(results) {
			// ---- 登録されていない場合 ---- //
			if (results.length == 0) {
 				// APIで検索する（検索してなかったものは登録しない）
 				// XXX登録しないようにするかどうするか
				getGoogleBookInfo(itemNo)
				.then(function(httpResponse) {
					var _response = JSON.parse(httpResponse.text);
					// 見つからなかった場合
					console.log(httpResponse);
					if (_response.totalItems == 0) {
						// なかった場合は国会図書館のAPIを使う
						// XXX 後で実装する
						response.error("APIで検索できませんでした。");
				// 		var xmlToJSON = require('cloud/xmlToJSON.js');
				// 		console.log(xmlToJSON);
				// 		var json = new xmlToJSON().parseString(httpResponse.text);
					} else {
						// 見つかった場合
						for (var i = 0; i < _response.items.length; i++) {
							var res_item = _response.items[i];
							for (var j = 0; j < res_item.volumeInfo.industryIdentifiers.length; j++) {
								var industryIdentifier = res_item.volumeInfo.industryIdentifiers[j];
								if (industryIdentifier.identifier == itemNo) {
									// 品目を登録する
									var item = new Item();
									item.save({ itemNo : itemNo, attributes : JSON.stringify(res_item) }, {
										success: function(object) {
											// 場所を検索する
											// 後でリファクタする
											var Location = Parse.Object.extend("Location");
											var query = new Parse.Query(Location);
											query.get(locationId, {
												success: function(object) {
													// 保有を登録する
									    			var Holding = Parse.Object.extend("Holding");
													var holding = new Holding();
													holding.save({ item : item, location : object }, {
														success: function(object) {
															response.success({ message: "登録しました。" });
														},
														error: function(model, error) {
															response.error(error);
														}
													});	    														
											  	},
												error: function(object, error) {
													response.error(error);
												}
											});

										},
										error: function(model, error) {
											response.error(error);
										}
									});
								}
							};
						};
					}
				}, function(httpResponse) {
				  // error
					console.error('Request failed with response code ' + httpResponse.status);
					response.error(httpResponse);
				});
			}
			// ---- 登録されている場合 ---- //
			if (results.length != 0) {
				// 場所を検索する
				var Location = Parse.Object.extend("Location");
				var query = new Parse.Query(Location);
				query.get(locationId, {
					success: function(object) {
		    			// 保有を登録する
		    			var Holding = Parse.Object.extend("Holding");
						var holding = new Holding();
						holding.save({ item : results[0], location : object }, {
							success: function(object) {
								response.success({ message: "登録しました。"});
							},
							error: function(model, error) {
								response.error(error);
							}
						});			
				  	},
					error: function(object, error) {
						response.error(error);
					}
				});
			}
		},
		error: function(error) {
			response.error(error);
		}
 	});
});

/**
 * 貸出の記録
 * @param {string} itemNo - Item.itemId
 * @param {string} memberId - Member.objectId
 */
Parse.Cloud.define("recordLending", function(request, response) {
	var itemNo = request.params.itemNo;
	var memberId = request.params.memberId;
	// 保有を検索する
	var Holding = Parse.Object.extend("Holding");
	var Item = Parse.Object.extend("Item");
	var query = new Parse.Query(Holding);
	var innerQuery = new Parse.Query(Item);
	innerQuery.equalTo("itemNo", itemNo);
	query.matchesKeyInQuery("item", "objectId", innerQuery);
	query.find({
		success: function(results) {
			// 登録されていない場合はエラー
			if (results.length == 0) {
				response.error("保有が登録されていません。");
				return;
			}
			// 書架にある保有を探す
			for (var i = results.length - 1; i >= 0; i--) {
				if (results[i].attributes.member == null) {
					// 会員を検索する
					var Member = Parse.Object.extend("Member");
					var query = new Parse.Query(Member);
					query.get(memberId, {
						success: function(object) {
							results[i].save({ member : object }, {
								success: function(object) {
									response.success({ message: "貸出しました。" });
								},
								error: function(model, error) {
									response.error(error);
								}
							});
					  	},
						error: function(object, error) {
							console.log(error);
						}
					});
					return;
				}
			};
			// 書架にない場合はエラー
			// XXX 又貸しを許すかどうか
			response.error("書架にある保有はありません。又貸しは禁止です。");
	  	},
		error: function(error) {
			response.error(error);
		}
	});
});

/**
 * 入庫の記録（返却、移動）
 * @param {string} itemNo - Item.itemId
 * @param {string} locationId - Location.objectId
 */
Parse.Cloud.define("recordIncoming", function(request, response) {
	var itemNo = request.params.itemNo;
	var locationId = request.params.locationId;
	// 保有を検索する
	var Holding = Parse.Object.extend("Holding");
	var Item = Parse.Object.extend("Item");
	var query = new Parse.Query(Holding);
	var innerQuery = new Parse.Query(Item);
	innerQuery.equalTo("itemNo", itemNo);
	query.matchesKeyInQuery("item", "objectId", innerQuery);
	query.find({
		success: function(results) {
			// 登録されていない場合はエラー
			if (results.length == 0) {
				response.error("保有が登録されていません。");
				return;
			}
			// 貸出中の保有を探す
			// XXX 現状だと、移動と返却の区別がつかない
			for (var i = results.length - 1; i >= 0; i--) {
				if (results[i].attributes.member != null) {
					var Location = Parse.Object.extend("Location");
					var query = new Parse.Query(Location);
					query.get(locationId, {
						success: function(object) {
							results[i].save({ location : object, member : null }, {
								success: function(object) {
									response.success({ message: "返却しました。" });
								},
								error: function(model, error) {
									response.error(error);
								}
							});
					  	},
						error: function(object, error) {
							console.log(error);
						}
					});					
					return;
				}
			};
	  	},
		error: function(error) {
			response.error(error);
		}
	});
});

/**
 * 保有の検索
 * @param {string} params
 */
Parse.Cloud.define("getHoldings", function(request, response) {
	var Holding = Parse.Object.extend("Holding");
	var Item = Parse.Object.extend("Item");
	var query = new Parse.Query(Holding);
	query.include("item");
	query.include("location");
	query.include("member");
	query.find({
		success: function(results) {
			response.success(results);
	  	},
		error: function(error) {
			response.error(error);
		}
	});
});

/**
 * 場所の検索
 * @param {string} locationNo - Location.locationNo
 */
Parse.Cloud.define("getLocation", function(request, response) {
	var locationNo = request.params.locationNo;
	var Location = Parse.Object.extend("Location");
	var query = new Parse.Query(Location);
	query.equalTo("locationNo", locationNo);
	query.find({
		success: function(results) {
			// 登録されていなければエラー
			if (results.length == 0) {
				response.error("棚が登録されていません。");
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

getLocation = function(locationId) {
	var Location = Parse.Object.extend("Location");
	var query = new Parse.Query(Location);
	query.get(locationId, {
		success: function(object) {
			return object;
	  	},
		error: function(object, error) {
			console.log(error);
		}
	});
}

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
		AWSAccessKeyId:"AKIAI27S6S7W3RZN6P5Q",
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