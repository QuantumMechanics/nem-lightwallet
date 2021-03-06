'use strict';

define([
    'definitions',
    'jquery',
    'utils/CryptoHelpers',
    'sinks',

    'filters/filters',
    'services/Transactions'
], function(angular, $, CryptoHelpers, sinks) {
    var mod = angular.module('walletApp.controllers');

    mod.controller('TxMosaicCtrl',
        ["$scope", "$window", "$timeout", "Transactions", 'walletScope',
        function($scope, $window, $timeout, Transactions, walletScope) {
            $scope.walletScope = walletScope;
            $scope.storage = $window.localStorage;
            $scope.storage.setDefault('txMosaicDefaults', {});

            // begin tracking currently selected account and it's mosaics
            $scope._updateCurrentAccount = function() {
                var acct = $scope.walletScope.accountData.account.address
                if ($scope.txMosaicData.isMultisig) {
                    acct = $scope.txMosaicData.multisigAccount.address;
                }
                $scope.currentAccount = acct;
            };

            $scope.selectTab = function selectTab(v) {
                if (v === 'multisig') {
                    $scope.txMosaicData.isMultisig = true;
                } else {
                    $scope.txMosaicData.isMultisig = false;
                }
                $scope.updateCurrentAccountMosaics();
            };

            $scope.updateCurrentAccountMosaics = function updateCurrentAccountMosaics() {
                $scope._updateCurrentAccount();
                var acct = $scope.currentAccount;
                // we could do it without separate variable, but we want keys to be sorted
                $scope.currentAccountMosaicNames = Object.keys($scope.walletScope.mosaicOwned[acct]).sort();
                $scope.selectedMosaic = "nem:xem";

                var ownedNamespaces = walletScope.namespaceOwned[acct];
                if (ownedNamespaces) {
                    $scope.txMosaicData.namespaceParent = ownedNamespaces[Object.keys(ownedNamespaces)[0]];
                } else {
                    alert("this account does not own any namespaces, try choosing non-multisig or a different account");
                }
            };
            // end begin tracking currently selected account and it's mosaics


            // load data from storage
            $scope.common = {
                'requiresKey': $scope.walletScope.sessionData.getRememberedKey() === undefined,
                'password': '',
                'privatekey': '',
            };
            $scope.txMosaicData = {
                'mosaicFeeSink': '',
                'mosaicFee': 50000 * 1000000,
                'mosaicName': '',
                'namespaceParent': '',
                'mosaicDescription': $scope.storage.getObject('txMosaicDefaults').mosaicDescription || '',
                'properties': {'initialSupply':0, 'divisibility':0, 'transferable':true, 'supplyMutable':true},
                'levy':{'mosaic':null, 'address':'', 'feeType':1, 'fee':5},
                'fee': 0,
                'innerFee': 0,
                'due': $scope.storage.getObject('txMosaicDefaults').due || 60,
                'isMultisig': ($scope.storage.getObject('txMosaicDefaults').isMultisig  && walletScope.accountData.meta.cosignatoryOf.length > 0) || false,
                'multisigAccount': walletScope.accountData.meta.cosignatoryOf.length == 0?'':walletScope.accountData.meta.cosignatoryOf[0]
            };
            $scope.txMosaicData.mosaicFeeSink = sinks.mosaic[$scope.walletScope.networkId];

            $scope.hasLevy = false;
            function updateFee() {
                var entity = Transactions.prepareMosaicDefinition($scope.common, $scope.txMosaicData);
                $scope.txMosaicData.fee = entity.fee;
                if ($scope.txMosaicData.isMultisig) {
                    $scope.txMosaicData.innerFee = entity.otherTrans.fee;
                }
            }

            $scope.$watchGroup(['common.password', 'common.privatekey'], function(nv,ov){
                $scope.invalidKeyOrPassword = false;
            });
            $scope.$watchGroup(['txMosaicData.isMultisig'], function(nv, ov){
                updateFee();
            });
            $scope.$watch('selectedMosaic', function(){
                if ($scope.hasLevy) {
                    $scope.txMosaicData.levy.mosaic = $scope.walletScope.mosaicOwned[$scope.currentAccount][$scope.selectedMosaic].mosaicId;
                } else {
                    $scope.txMosaicData.levy.mosaic = null;
                }
            });

            $scope.updateCurrentAccountMosaics();

            $scope.okPressed = false;
            $scope.ok = function txMosaicOk() {
                $scope.okPressed = true;
                $timeout(function txMosaicDeferred(){
                    $scope._ok();
                    $scope.okPressed = false;
                });
            };
            $scope._ok = function txMosaic_Ok() {
                var orig = $scope.storage.getObject('txMosaicDefaults');
                $.extend(orig, {
                    'due': $scope.txMosaicData.due,
                    'isMultisig': $scope.txMosaicData.isMultisig,
                });
                $scope.storage.setObject('txMosaicDefaults', orig);

                var rememberedKey = $scope.walletScope.sessionData.getRememberedKey();
                if (rememberedKey) {
                    $scope.common.privatekey = CryptoHelpers.decrypt(rememberedKey);
                } else {
                    if (! CryptoHelpers.passwordToPrivatekey($scope.common, $scope.walletScope.networkId, $scope.walletScope.walletAccount) ) {
                        $scope.invalidKeyOrPassword = true;
                        return;
                    }
                }
                var entity = Transactions.prepareMosaicDefinition($scope.common, $scope.txMosaicData);
                Transactions.serializeAndAnnounceTransaction(entity, $scope.common, $scope.txMosaicData, $scope.walletScope.nisPort,
                    function(data) {
                        if (data.status === 200) {
                            if (data.data.code >= 2) {
                                alert('failed when trying to send tx: ' + data.data.message);
                            } else {
                                $scope.$close();
                            }
                        }
                        if (rememberedKey) { delete $scope.common.privatekey; }
                    },
                    function(operation, data) {
                        // will do for now, will change it to modal later
                        alert('failed at '+operation + " " + data.data.error + " " + data.data.message);
                        if (rememberedKey) { delete $scope.common.privatekey; }
                    }
                );
            }; // $scope._ok

            $scope.cancel = function () {
                $scope.$dismiss();
            };
        }
    ]);
});
